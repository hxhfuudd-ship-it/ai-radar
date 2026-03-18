import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { and, desc, eq, gte, like, or, type SQL } from 'drizzle-orm';
import { APP_CONFIG } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tag = searchParams.get('tag');
  const search = searchParams.get('search');
  const mode = searchParams.get('mode') === 'recommended' ? 'recommended' : 'hot';
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100);
  const offset = Number(searchParams.get('offset') ?? 0);

  let query = db.select().from(schema.projects);
  const conditions: SQL[] = [];

  if (mode === 'hot') {
    const cutoff = new Date(Date.now() - APP_CONFIG.hotProjectWindowDays * 86_400_000).toISOString();
    conditions.push(gte(schema.projects.repoCreatedAt, cutoff));
  }

  if (tag) {
    const tagRecord = await db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.name, tag))
      .get();

    if (!tagRecord) {
      return NextResponse.json({ projects: [], total: 0, mode, hotWindowDays: APP_CONFIG.hotProjectWindowDays });
    }

    const ptRows = await db
      .select({ projectId: schema.projectTags.projectId })
      .from(schema.projectTags)
      .where(eq(schema.projectTags.tagId, tagRecord.id))
      .all();
    const projectIds = ptRows.map(pt => pt.projectId);

    if (projectIds.length > 0) {
      const tagCondition = or(...projectIds.map(id => eq(schema.projects.id, id)));
      if (tagCondition) {
        conditions.push(tagCondition);
      }
    } else {
      return NextResponse.json({ projects: [], total: 0, mode, hotWindowDays: APP_CONFIG.hotProjectWindowDays });
    }
  }

  if (search) {
    const searchCondition = or(
      like(schema.projects.name, `%${search}%`),
      like(schema.projects.description, `%${search}%`),
      like(schema.projects.summary, `%${search}%`),
      like(schema.projects.topics, `%${search}%`),
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (conditions.length === 1) {
    query = query.where(conditions[0]) as typeof query;
  } else if (conditions.length > 1) {
    query = query.where(
      and(...conditions)
    ) as typeof query;
  }

  const projects = await query
    .orderBy(
      ...(mode === 'recommended'
        ? [
            desc(schema.projects.score),
            desc(schema.projects.stars),
            desc(schema.projects.repoUpdatedAt),
          ]
        : [
            desc(schema.projects.stars),
            desc(schema.projects.forks),
            desc(schema.projects.repoUpdatedAt),
            desc(schema.projects.score),
          ])
    )
    .limit(limit)
    .offset(offset)
    .all();

  return NextResponse.json({
    projects,
    total: projects.length,
    mode,
    hotWindowDays: APP_CONFIG.hotProjectWindowDays,
  });
}
