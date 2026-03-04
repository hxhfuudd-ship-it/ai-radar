import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = db
    .select({
      bookmark: schema.bookmarks,
      project: schema.projects,
    })
    .from(schema.bookmarks)
    .innerJoin(schema.projects, eq(schema.bookmarks.projectId, schema.projects.id))
    .orderBy(schema.bookmarks.createdAt)
    .all()
    .reverse();

  const bookmarks = rows.map((r) => ({
    ...r.bookmark,
    project: r.project,
  }));

  return NextResponse.json({ bookmarks });
}

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

export async function PATCH(request: NextRequest) {
  const { projectId, note } = await request.json();

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const existing = db
    .select()
    .from(schema.bookmarks)
    .where(eq(schema.bookmarks.projectId, projectId))
    .get();

  if (!existing) {
    return NextResponse.json({ error: 'bookmark not found' }, { status: 404 });
  }

  db.update(schema.bookmarks)
    .set({ note: note ?? null })
    .where(eq(schema.bookmarks.id, existing.id))
    .run();

  return NextResponse.json({ success: true, note: note ?? null });
}
