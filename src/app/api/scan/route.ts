import { NextRequest, NextResponse } from 'next/server';
import { runFullScan } from '@/lib/agents/orchestrator';
import { getScanStatus, updateScanStatus, resetScanStatus } from '@/lib/scan-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const status = getScanStatus();
  if (status.running) {
    return NextResponse.json({ success: false, error: '扫描正在进行中' }, { status: 409 });
  }

  let force = false;
  try {
    const body = await req.json();
    force = !!body.force;
  } catch {
    // no body or invalid JSON, that's fine
  }

  resetScanStatus();

  runFullScan((progress) => {
    updateScanStatus({
      phase: progress.phase,
      total: progress.total,
      completed: progress.completed,
      current: progress.current ?? '',
      error: progress.error ?? '',
    });
  }, force)
    .then((result) => {
      updateScanStatus({
        running: false,
        phase: 'done',
        total: result.projectsFound,
        completed: result.newAnalyzed,
        current: result.newAnalyzed === 0
          ? `找到 ${result.projectsFound} 个项目，全部已是最新`
          : `新分析了 ${result.newAnalyzed} 个项目（共 ${result.projectsFound} 个）`,
        finishedAt: Date.now(),
      });
    })
    .catch((err) => {
      updateScanStatus({
        running: false,
        phase: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        finishedAt: Date.now(),
      });
    });

  return NextResponse.json({ success: true, message: force ? '强制扫描已启动' : '扫描已启动' });
}

export async function GET() {
  return NextResponse.json(getScanStatus());
}
