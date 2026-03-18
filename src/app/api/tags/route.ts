import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { APP_CONFIG } from '@/lib/config';
import { asc, eq, gte, or } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') === 'recommended' ? 'recommended' : 'hot';

  if (mode === 'recommended') {
    const tags = await db.select().from(schema.tags).orderBy(asc(schema.tags.name)).all();
    return NextResponse.json({ tags });
  }

  const cutoff = new Date(Date.now() - APP_CONFIG.hotProjectWindowDays * 86_400_000).toISOString();
  const hotProjects = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(gte(schema.projects.repoCreatedAt, cutoff))
    .all();

  if (hotProjects.length === 0) {
    return NextResponse.json({ tags: [] });
  }

  const projectCondition = or(...hotProjects.map(project => eq(schema.projectTags.projectId, project.id)));
  if (!projectCondition) {
    return NextResponse.json({ tags: [] });
  }

  const links = await db
    .select({ tagId: schema.projectTags.tagId })
    .from(schema.projectTags)
    .where(projectCondition)
    .all();

  const uniqueTagIds = Array.from(new Set(links.map(link => link.tagId)));
  if (uniqueTagIds.length === 0) {
    return NextResponse.json({ tags: [] });
  }

  const tagCondition = or(...uniqueTagIds.map(id => eq(schema.tags.id, id)));
  if (!tagCondition) {
    return NextResponse.json({ tags: [] });
  }

  const tags = await db
    .select()
    .from(schema.tags)
    .where(tagCondition)
    .orderBy(asc(schema.tags.name))
    .all();

  return NextResponse.json({ tags });
}
