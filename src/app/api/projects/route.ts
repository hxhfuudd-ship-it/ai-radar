import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { desc, like, or, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tag = searchParams.get('tag');
  const search = searchParams.get('search');
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100);
  const offset = Number(searchParams.get('offset') ?? 0);

  let query = db.select().from(schema.projects);

  if (tag) {
    const tagRecord = await db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.name, tag))
      .get();

    if (tagRecord) {
      const ptRows = await db
        .select({ projectId: schema.projectTags.projectId })
        .from(schema.projectTags)
        .where(eq(schema.projectTags.tagId, tagRecord.id))
        .all();
      const projectIds = ptRows.map(pt => pt.projectId);

      if (projectIds.length > 0) {
        query = query.where(
          or(...projectIds.map(id => eq(schema.projects.id, id)))
        ) as typeof query;
      } else {
        return NextResponse.json({ projects: [], total: 0 });
      }
    }
  }

  if (search) {
    query = query.where(
      or(
        like(schema.projects.name, `%${search}%`),
        like(schema.projects.description, `%${search}%`),
        like(schema.projects.summary, `%${search}%`),
        like(schema.projects.topics, `%${search}%`),
      )
    ) as typeof query;
  }

  const projects = await query
    .orderBy(desc(schema.projects.score), desc(schema.projects.stars))
    .limit(limit)
    .offset(offset)
    .all();

  return NextResponse.json({ projects, total: projects.length });
}
