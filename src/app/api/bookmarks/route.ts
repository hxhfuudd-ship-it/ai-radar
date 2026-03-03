import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { projectId, note } = await request.json();

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const existing = db
    .select()
    .from(schema.bookmarks)
    .where(eq(schema.bookmarks.projectId, projectId))
    .get();

  if (existing) {
    db.delete(schema.bookmarks)
      .where(eq(schema.bookmarks.id, existing.id))
      .run();
    return NextResponse.json({ bookmarked: false });
  }

  db.insert(schema.bookmarks)
    .values({
      projectId,
      note: note ?? null,
      createdAt: new Date().toISOString(),
    })
    .run();

  return NextResponse.json({ bookmarked: true });
}
