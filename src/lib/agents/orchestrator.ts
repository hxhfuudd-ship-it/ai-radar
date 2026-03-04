import { v4 as uuid } from 'uuid';
import { runScout } from './scout';
import { analyzeProject } from './analyst';
import type { RawProject } from './types';
import { db, schema } from '../db';
import { eq, lt } from 'drizzle-orm';
import { getRepoReadme } from '../mcp/github/tools';
import { APP_CONFIG } from '../config';
import { updateScanStatus } from '../scan-state';

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
    cleanupOldProjects();

    onProgress?.({ phase: 'scouting', total: 0, completed: 0 });

    const scanResult = await runScout();
    const { projects } = scanResult;

    const dedupedProjects = dedup(projects);
    const needAnalysis: RawProject[] = [];
    const skipped: string[] = [];

    for (const p of dedupedProjects) {
      const existing = db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.fullName, p.fullName))
        .get();

      // 即使跳过分析，也更新基础元数据
      if (existing) {
        db.update(schema.projects)
          .set({
            stars: p.stars,
            forks: p.forks,
            repoCreatedAt: p.createdAt,
            repoUpdatedAt: p.updatedAt,
            description: p.description,
            language: p.language,
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
      return { projectsFound: dedupedProjects.length, newAnalyzed: 0 };
    }

    // README 预取
    updateScanStatus({ phase: 'fetching', current: `获取 ${needAnalysis.length} 个项目的 README...` });
    onProgress?.({
      phase: 'fetching',
      total: needAnalysis.length,
      completed: 0,
      current: `获取 ${needAnalysis.length} 个项目的 README...`,
    });

    const readmeMap = new Map<string, string>();
    const README_BATCH = 8;
    for (let i = 0; i < needAnalysis.length; i += README_BATCH) {
      const batch = needAnalysis.slice(i, i + README_BATCH);
      const results = await Promise.allSettled(
        batch.map(p => getRepoReadme(p.fullName))
      );
      results.forEach((r, idx) => {
        readmeMap.set(batch[idx].fullName, r.status === 'fulfilled' ? r.value : '');
      });
      const fetched = Math.min(i + README_BATCH, needAnalysis.length);
      updateScanStatus({ completed: fetched, total: needAnalysis.length });
      onProgress?.({
        phase: 'fetching',
        total: needAnalysis.length,
        completed: fetched,
        current: `已获取 ${fetched}/${needAnalysis.length} 个 README`,
      });
    }

    // LLM 分析
    updateScanStatus({ phase: 'analyzing', completed: 0 });
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
      updateScanStatus({ completed, current: names });
      onProgress?.({
        phase: 'analyzing',
        total: needAnalysis.length,
        completed,
        current: names,
      });

      const results = await Promise.allSettled(
        batch.map(project => {
          const readme = readmeMap.get(project.fullName) ?? '';
          return processProject(project, scanResult.scannedAt, readme);
        })
      );

      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'rejected') {
          console.error(`Failed: ${batch[j].fullName}`, (results[j] as PromiseRejectedResult).reason);
        }
      }

      completed += batch.length;
    }

    onProgress?.({
      phase: 'done',
      total: needAnalysis.length,
      completed: needAnalysis.length,
    });

    return { projectsFound: projects.length, newAnalyzed: needAnalysis.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    onProgress?.({ phase: 'error', total: 0, completed: 0, error: message });
    throw err;
  }
}

async function processProject(project: RawProject, scannedAt: string, readme: string) {
  const existing = db
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
    db.update(schema.projects)
      .set(record)
      .where(eq(schema.projects.id, existing.id))
      .run();
  } else {
    db.insert(schema.projects).values(record).run();
  }

  for (const tagName of analysis.tags) {
    let tag = db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.name, tagName))
      .get();

    if (!tag) {
      db.insert(schema.tags).values({ name: tagName }).run();
      tag = db
        .select()
        .from(schema.tags)
        .where(eq(schema.tags.name, tagName))
        .get();
    }

    if (tag) {
      const existingLink = db
        .select()
        .from(schema.projectTags)
        .where(eq(schema.projectTags.projectId, record.id))
        .all()
        .find(pt => pt.tagId === tag!.id);

      if (!existingLink) {
        db.insert(schema.projectTags)
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

function cleanupOldProjects() {
  // 清理 30 天前的旧项目
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const old = db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(lt(schema.projects.discoveredAt, cutoff))
    .all();

  for (const { id } of old) {
    db.delete(schema.projectTags).where(eq(schema.projectTags.projectId, id)).run();
    db.delete(schema.bookmarks).where(eq(schema.bookmarks.projectId, id)).run();
    db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
  }

  if (old.length > 0) {
    console.log(`[Cleanup] 清理了 ${old.length} 个 30 天前的旧项目`);
  }

  // 清理重复项：同一个 fullName 只保留最新的
  const all = db
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
      db.delete(schema.projectTags).where(eq(schema.projectTags.projectId, rows[i].id)).run();
      db.delete(schema.bookmarks).where(eq(schema.bookmarks.projectId, rows[i].id)).run();
      db.delete(schema.projects).where(eq(schema.projects.id, rows[i].id)).run();
      dupCount++;
    }
  }

  if (dupCount > 0) {
    console.log(`[Cleanup] 清理了 ${dupCount} 个重复项目`);
  }
}
