import { v4 as uuid } from 'uuid';
import { runScout } from './scout';
import { analyzeProject } from './analyst';
import type { RawProject } from './types';
import { db, schema } from '../db';
import { eq, lt } from 'drizzle-orm';
import { getRepoDetail, getRepoReadme } from '../mcp/github/tools';
import { APP_CONFIG } from '../config';

export interface ScanProgress {
  phase: 'scouting' | 'fetching' | 'analyzing' | 'done' | 'error';
  total: number;
  completed: number;
  current?: string;
  error?: string;
}

type ProgressCallback = (progress: ScanProgress) => void;

export async function runFullScan(onProgress?: ProgressCallback, force = false) {
  try {
    await cleanupOldProjects();

    onProgress?.({
      phase: 'scouting',
      total: 0,
      completed: 0,
      current: '刷新已有项目数据...',
    });
    await refreshTrackedProjects(onProgress);

    onProgress?.({ phase: 'scouting', total: 0, completed: 0 });

    const scanResult = await runScout();
    const { projects } = scanResult;

    const dedupedProjects = dedup(projects);
    const needAnalysis: RawProject[] = [];
    const skipped: string[] = [];

    for (const p of dedupedProjects) {
      const existing = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.fullName, p.fullName))
        .get();

      if (existing) {
        await db.update(schema.projects)
          .set({
            name: p.name,
            url: p.url,
            stars: p.stars,
            forks: p.forks,
            repoCreatedAt: p.createdAt,
            repoUpdatedAt: p.updatedAt,
            description: p.description,
            language: p.language,
            topics: p.topics.join(','),
          })
          .where(eq(schema.projects.id, existing.id))
          .run();
      }

      if (!force && existing?.analyzedAt) {
        const daysSince = (Date.now() - new Date(existing.analyzedAt).getTime()) / 86_400_000;
        if (daysSince < APP_CONFIG.skipIfAnalyzedWithinDays) {
          skipped.push(p.name);
          continue;
        }
      }
      needAnalysis.push(p);
    }

    if (needAnalysis.length === 0) {
      onProgress?.({
        phase: 'done',
        total: dedupedProjects.length,
        completed: dedupedProjects.length,
        current: `找到 ${dedupedProjects.length} 个项目，全部已是最新`,
      });
      return {
        projectsFound: dedupedProjects.length,
        newAnalyzed: 0,
        scannedAt: scanResult.scannedAt,
      };
    }

    onProgress?.({
      phase: 'fetching',
      total: needAnalysis.length,
      completed: 0,
      current: `获取 ${needAnalysis.length} 个项目的 README...`,
    });

    const readmeMap = new Map<string, string>();
    let fetched = 0;
    const README_BATCH = 8;
    for (let i = 0; i < needAnalysis.length; i += README_BATCH) {
      const batch = needAnalysis.slice(i, i + README_BATCH);
      await Promise.all(
        batch.map(async (project) => {
          try {
            const readme = await getRepoReadme(project.fullName);
            readmeMap.set(project.fullName, readme);
          } catch {
            readmeMap.set(project.fullName, '');
          }

          fetched += 1;
          onProgress?.({
            phase: 'fetching',
            total: needAnalysis.length,
            completed: fetched,
            current: `已获取 ${fetched}/${needAnalysis.length} 个 README`,
          });
        })
      );
    }

    onProgress?.({
      phase: 'analyzing',
      total: needAnalysis.length,
      completed: 0,
      current: `开始 AI 深度分析...`,
    });

    const CONCURRENCY = APP_CONFIG.analysisConcurrency;
    let completed = 0;

    for (let i = 0; i < needAnalysis.length; i += CONCURRENCY) {
      const batch = needAnalysis.slice(i, i + CONCURRENCY);
      const names = batch.map(p => p.name).join(', ');
      onProgress?.({
        phase: 'analyzing',
        total: needAnalysis.length,
        completed,
        current: `正在分析：${names}`,
      });

      await Promise.all(
        batch.map(async (project) => {
          try {
            const readme = readmeMap.get(project.fullName) ?? '';
            await processProject(project, scanResult.scannedAt, readme);
          } catch (err) {
            console.error(`Failed: ${project.fullName}`, err);
          } finally {
            completed += 1;
            onProgress?.({
              phase: 'analyzing',
              total: needAnalysis.length,
              completed,
              current: `已完成 ${completed}/${needAnalysis.length}：${project.name}`,
            });
          }
        })
      );
    }

    onProgress?.({
      phase: 'done',
      total: needAnalysis.length,
      completed: needAnalysis.length,
    });

    return {
      projectsFound: projects.length,
      newAnalyzed: needAnalysis.length,
      scannedAt: scanResult.scannedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    onProgress?.({ phase: 'error', total: 0, completed: 0, error: message });
    throw err;
  }
}

async function processProject(project: RawProject, scannedAt: string, readme: string) {
  const existing = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.fullName, project.fullName))
    .get();

  const analysis = await analyzeProject(project, readme);

  const record = {
    id: existing?.id ?? uuid(),
    name: project.name,
    fullName: project.fullName,
    url: project.url,
    description: project.description,
    stars: project.stars,
    forks: project.forks,
    language: project.language,
    topics: project.topics.join(','),
    repoCreatedAt: project.createdAt,
    repoUpdatedAt: project.updatedAt,
    summary: analysis.summary,
    analysis: analysis.analysis,
    score: analysis.score,
    discoveredAt: existing?.discoveredAt ?? scannedAt,
    analyzedAt: new Date().toISOString(),
  };

  if (existing) {
    await db.update(schema.projects)
      .set(record)
      .where(eq(schema.projects.id, existing.id))
      .run();
  } else {
    await db.insert(schema.projects).values(record).run();
  }

  for (const tagName of analysis.tags) {
    let tag = await db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.name, tagName))
      .get();

    if (!tag) {
      await db.insert(schema.tags).values({ name: tagName }).run();
      tag = await db
        .select()
        .from(schema.tags)
        .where(eq(schema.tags.name, tagName))
        .get();
    }

    if (tag) {
      const links = await db
        .select()
        .from(schema.projectTags)
        .where(eq(schema.projectTags.projectId, record.id))
        .all();
      const existingLink = links.find(pt => pt.tagId === tag!.id);

      if (!existingLink) {
        await db.insert(schema.projectTags)
          .values({ projectId: record.id, tagId: tag.id })
          .run();
      }
    }
  }
}

function dedup(projects: RawProject[]): RawProject[] {
  const seen = new Set<string>();
  return projects.filter(p => {
    if (seen.has(p.fullName)) return false;
    seen.add(p.fullName);
    return true;
  });
}

async function cleanupOldProjects() {
  const bookmarkRows = await db.select({ projectId: schema.bookmarks.projectId }).from(schema.bookmarks).all();
  const bookmarkedIds = new Set(bookmarkRows.map(b => b.projectId));

  const cutoff = new Date(Date.now() - APP_CONFIG.projectRetentionDays * 86_400_000).toISOString();
  const oldRows = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(lt(schema.projects.discoveredAt, cutoff))
    .all();
  const old = oldRows.filter(p => !bookmarkedIds.has(p.id));

  for (const { id } of old) {
    await db.delete(schema.projectTags).where(eq(schema.projectTags.projectId, id)).run();
    await db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
  }

  if (old.length > 0) {
    console.log(`[Cleanup] 清理了 ${old.length} 个 ${APP_CONFIG.projectRetentionDays} 天前的旧项目（已跳过收藏项目）`);
  }

  const all = await db
    .select({ id: schema.projects.id, fullName: schema.projects.fullName, analyzedAt: schema.projects.analyzedAt })
    .from(schema.projects)
    .all();

  const byName = new Map<string, typeof all>();
  for (const row of all) {
    const list = byName.get(row.fullName) ?? [];
    list.push(row);
    byName.set(row.fullName, list);
  }

  let dupCount = 0;
  for (const [, rows] of byName) {
    if (rows.length <= 1) continue;
    rows.sort((a, b) => (b.analyzedAt ?? '').localeCompare(a.analyzedAt ?? ''));
    for (let i = 1; i < rows.length; i++) {
      const dupId = rows[i].id;
      if (bookmarkedIds.has(dupId)) continue;
      await db.delete(schema.projectTags).where(eq(schema.projectTags.projectId, dupId)).run();
      await db.delete(schema.projects).where(eq(schema.projects.id, dupId)).run();
      dupCount++;
    }
  }

  if (dupCount > 0) {
    console.log(`[Cleanup] 清理了 ${dupCount} 个重复项目`);
  }
}

async function refreshTrackedProjects(onProgress?: ProgressCallback) {
  const trackedProjects = await db
    .select({
      id: schema.projects.id,
      fullName: schema.projects.fullName,
    })
    .from(schema.projects)
    .all();

  if (trackedProjects.length === 0) {
    return;
  }

  let completed = 0;
  const batchSize = 8;

  for (let i = 0; i < trackedProjects.length; i += batchSize) {
    const batch = trackedProjects.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (project) => {
        try {
          const detail = await getRepoDetail(project.fullName);
          if (!detail) return;

          await db.update(schema.projects)
            .set({
              name: detail.name,
              fullName: detail.full_name,
              url: detail.html_url,
              description: detail.description,
              stars: detail.stargazers_count,
              forks: detail.forks_count,
              language: detail.language,
              topics: detail.topics.join(','),
              repoCreatedAt: detail.created_at,
              repoUpdatedAt: detail.updated_at,
            })
            .where(eq(schema.projects.id, project.id))
            .run();
        } catch (err) {
          console.error(`Failed to refresh ${project.fullName}`, err);
        } finally {
          completed += 1;
          onProgress?.({
            phase: 'scouting',
            total: trackedProjects.length,
            completed,
            current: `已刷新 ${completed}/${trackedProjects.length} 个已有项目`,
          });
        }
      })
    );
  }
}
