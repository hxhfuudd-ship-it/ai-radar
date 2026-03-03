import { NextResponse } from 'next/server';
import { runFullScan } from '@/lib/agents/orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await runFullScan((progress) => {
      console.log(`[Scan] ${progress.phase} - ${progress.completed}/${progress.total} ${progress.current ?? ''}`);
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
