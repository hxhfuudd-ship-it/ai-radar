import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const tagLinks = db
    .select()
    .from(schema.projectTags)
    .where(eq(schema.projectTags.projectId, id))
    .all();

  const tagRecords = tagLinks
    .map(tl =>
      db.select().from(schema.tags).where(eq(schema.tags.id, tl.tagId)).get()
    )
    .filter(Boolean);

  const isBookmarked = db
    .select()
    .from(schema.bookmarks)
    .where(eq(schema.bookmarks.projectId, id))
    .get();

  return NextResponse.json({
    project,
    tags: tagRecords.map(t => t!.name),
    isBookmarked: !!isBookmarked,
  });
}
