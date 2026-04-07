import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { and, count, countDistinct, desc, eq, gte, like, or, type SQL } from 'drizzle-orm';
import { APP_CONFIG } from '@/lib/config';
import type { Project } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

function combineConditions(conditions: SQL[]): SQL | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

const MIN_SNAPSHOT_GAP_HOURS = 12;

function computeVelocity(project: Project): number {
  if (!project.stars) return 0;

  if (project.previousStars != null && project.previousStarsAt) {
    const hoursSince = (Date.now() - new Date(project.previousStarsAt).getTime()) / 3_600_000;
    if (hoursSince >= MIN_SNAPSHOT_GAP_HOURS) {
      const daysBetween = hoursSince / 24;
      return (project.stars - project.previousStars) / daysBetween;
    }
  }

  if (!project.repoCreatedAt) return 0;
  const age = Math.max(1, (Date.now() - new Date(project.repoCreatedAt).getTime()) / 86_400_000);
  return project.stars / age;
}

function sortByVelocity(a: Project, b: Project): number {
  return computeVelocity(b) - computeVelocity(a)
    || (b.stars ?? 0) - (a.stars ?? 0)
    || (b.forks ?? 0) - (a.forks ?? 0);
}

const recommendedOrder = [
  desc(schema.projects.score),
  desc(schema.projects.stars),
  desc(schema.projects.repoUpdatedAt),
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tag = searchParams.get('tag');
  const search = searchParams.get('search');
  const mode = searchParams.get('mode') === 'recommended' ? 'recommended' : 'hot';
  const windowDays = mode === 'hot'
    ? Math.min(Math.max(Number(searchParams.get('window') ?? 30), 1), 365)
    : 0;
  const requestedLimit = Number(searchParams.get('limit') ?? 50);
  const requestedOffset = Number(searchParams.get('offset') ?? 0);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100)
    : 50;
  const offset = Number.isFinite(requestedOffset)
    ? Math.max(Math.floor(requestedOffset), 0)
    : 0;

  const conditions: SQL[] = [];

  if (mode === 'hot' && windowDays > 0) {
    const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    conditions.push(gte(schema.projects.repoCreatedAt, cutoff));
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

  const whereClause = combineConditions(conditions);

  let totalCount = 0;
  let projects: Project[];

  if (tag) {
    const tagConditions = [...conditions, eq(schema.tags.name, tag)];
    const tagWhereClause = combineConditions(tagConditions);

    let query = db
      .selectDistinct({ project: schema.projects })
      .from(schema.projects)
      .innerJoin(schema.projectTags, eq(schema.projectTags.projectId, schema.projects.id))
      .innerJoin(schema.tags, eq(schema.projectTags.tagId, schema.tags.id));

    let countQuery = db
      .select({ count: countDistinct(schema.projects.id) })
      .from(schema.projects)
      .innerJoin(schema.projectTags, eq(schema.projectTags.projectId, schema.projects.id))
      .innerJoin(schema.tags, eq(schema.projectTags.tagId, schema.tags.id));

    if (tagWhereClause) {
      query = query.where(tagWhereClause) as typeof query;
      countQuery = countQuery.where(tagWhereClause) as typeof countQuery;
    }

    if (mode === 'hot') {
      const [countRow, allRows] = await Promise.all([
        countQuery.get(),
        query.all(),
      ]);
      const allProjects = allRows.map(r => r.project);
      allProjects.sort(sortByVelocity);
      totalCount = Number(countRow?.count ?? 0);
      projects = allProjects.slice(offset, offset + limit);
    } else {
      const [countRow, projectRows] = await Promise.all([
        countQuery.get(),
        query.orderBy(...recommendedOrder).limit(limit).offset(offset).all(),
      ]);
      totalCount = Number(countRow?.count ?? 0);
      projects = projectRows.map(row => row.project);
    }
  } else {
    let query = db.select().from(schema.projects);
    let countQuery = db.select({ count: count() }).from(schema.projects);

    if (whereClause) {
      query = query.where(whereClause) as typeof query;
      countQuery = countQuery.where(whereClause) as typeof countQuery;
    }

    if (mode === 'hot') {
      const [countRow, allRows] = await Promise.all([
        countQuery.get(),
        query.all(),
      ]);
      allRows.sort(sortByVelocity);
      totalCount = Number(countRow?.count ?? 0);
      projects = allRows.slice(offset, offset + limit);
    } else {
      const [countRow, projectRows] = await Promise.all([
        countQuery.get(),
        query.orderBy(...recommendedOrder).limit(limit).offset(offset).all(),
      ]);
      totalCount = Number(countRow?.count ?? 0);
      projects = projectRows;
    }
  }

  return NextResponse.json({
    projects,
    total: totalCount,
    mode,
    limit,
    offset,
    hotWindowDays: windowDays || APP_CONFIG.hotProjectWindowDays,
  });
}
