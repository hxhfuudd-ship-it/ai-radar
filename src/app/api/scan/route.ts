import { NextRequest } from 'next/server';
import { runFullScan } from '@/lib/agents/orchestrator';
import { db, schema } from '@/lib/db';
import { desc, isNotNull } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

let scanRunning = false;
let lastScanAt: string | null = null;

export async function POST(req: NextRequest) {
  if (scanRunning) {
    return Response.json(
      { success: false, error: '扫描正在进行中' },
      { status: 409 },
    );
  }

  let force = false;
  try {
    const body = await req.json();
    force = !!body.force;
  } catch {
    // no body
  }

  scanRunning = true;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        } catch {
          // stream closed
        }
      };

      try {
        const result = await runFullScan((progress) => {
          send(progress);
        }, force);

        send({
          phase: 'done',
          total: result.projectsFound,
          completed: result.newAnalyzed,
          scannedAt: result.scannedAt,
          current: result.newAnalyzed === 0
            ? `找到 ${result.projectsFound} 个项目，全部已是最新`
            : `新分析了 ${result.newAnalyzed} 个项目（共 ${result.projectsFound} 个）`,
        });
        lastScanAt = result.scannedAt;
      } catch (err) {
        send({
          phase: 'error',
          total: 0,
          completed: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        scanRunning = false;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET() {
  const latestAnalyzed = await db
    .select({ analyzedAt: schema.projects.analyzedAt })
    .from(schema.projects)
    .where(isNotNull(schema.projects.analyzedAt))
    .orderBy(desc(schema.projects.analyzedAt))
    .limit(1)
    .get();

  return Response.json({
    running: scanRunning,
    lastScanAt: lastScanAt ?? latestAnalyzed?.analyzedAt ?? null,
  });
}
