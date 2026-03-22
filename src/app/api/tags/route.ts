import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { APP_CONFIG } from '@/lib/config';
import { asc, eq, gte } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') === 'recommended' ? 'recommended' : 'hot';

  if (mode === 'recommended') {
    const tags = await db.select().from(schema.tags).orderBy(asc(schema.tags.name)).all();
    return NextResponse.json({ tags });
  }

  const cutoff = new Date(Date.now() - APP_CONFIG.hotProjectWindowDays * 86_400_000).toISOString();
  const tags = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
    })
    .from(schema.tags)
    .innerJoin(schema.projectTags, eq(schema.projectTags.tagId, schema.tags.id))
    .innerJoin(schema.projects, eq(schema.projectTags.projectId, schema.projects.id))
    .where(gte(schema.projects.repoCreatedAt, cutoff))
    .groupBy(schema.tags.id, schema.tags.name)
    .orderBy(asc(schema.tags.name))
    .all();

  return NextResponse.json({ tags });
}
