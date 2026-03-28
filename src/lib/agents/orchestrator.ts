import { v4 as uuid } from 'uuid';
import { runScout } from './scout';
import {
  analyzeProject,
  buildFallbackAnalysis,
  buildFallbackSummary,
  canAnalyzeProject,
  computeProjectScore,
  extractTags,
} from './analyst';
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

export interface ScanSummary {
  projectsFound: number;
  savedProjects: number;
  analyzedProjects: number;
  analysisFailures: number;
  skippedProjects: number;
  scannedAt: string;
  message: string;
}

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
    const analysisEnabled = canAnalyzeProject();

    for (const p of dedupedProjects) {
      const existing = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.fullName, p.fullName))
        .get();

      if (existing) {
        const refreshedProject: RawProject = {
          name: p.name,
          fullName: p.fullName,
          url: p.url,
          description: p.description,
          stars: p.stars,
          forks: p.forks,
          language: p.language,
          topics: p.topics,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
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
            score: existing.analysis
              ? computeProjectScore(refreshedProject, existing.analysis)
              : existing.score,
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
      const message = `找到 ${dedupedProjects.length} 个项目，全部已是最新`;
      onProgress?.({
        phase: 'done',
        total: dedupedProjects.length,
        completed: 0,
        current: message,
      });
      return {
        projectsFound: dedupedProjects.length,
        savedProjects: 0,
        analyzedProjects: 0,
        analysisFailures: 0,
        skippedProjects: skipped.length,
        scannedAt: scanResult.scannedAt,
        message,
      };
    }

    const readmeMap = new Map<string, string>();
    if (analysisEnabled) {
      onProgress?.({
        phase: 'fetching',
        total: needAnalysis.length,
        completed: 0,
        current: `获取 ${needAnalysis.length} 个项目的 README...`,
      });

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
    }

    onProgress?.({
      phase: 'analyzing',
      total: needAnalysis.length,
      completed: 0,
      current: analysisEnabled
        ? '开始 AI 深度分析...'
        : '未检测到 AI 配置，正在保存项目基础信息...',
    });

    const CONCURRENCY = APP_CONFIG.analysisConcurrency;
    let completed = 0;
    let savedProjects = 0;
    let analyzedProjects = 0;
    let analysisFailures = 0;

    for (let i = 0; i < needAnalysis.length; i += CONCURRENCY) {
      const batch = needAnalysis.slice(i, i + CONCURRENCY);
      const names = batch.map(p => p.name).join(', ');
      onProgress?.({
        phase: 'analyzing',
        total: needAnalysis.length,
        completed,
        current: analysisEnabled ? `正在分析：${names}` : `正在保存：${names}`,
      });

      await Promise.all(
        batch.map(async (project) => {
          try {
            const readme = readmeMap.get(project.fullName) ?? '';
            const result = await processProject(project, scanResult.scannedAt, readme, analysisEnabled);
            if (result.saved) savedProjects += 1;
            if (result.analyzed) analyzedProjects += 1;
            if (result.analysisFailed) analysisFailures += 1;
          } catch (err) {
            console.error(`Failed: ${project.fullName}`, err);
          } finally {
            completed += 1;
            onProgress?.({
              phase: 'analyzing',
              total: needAnalysis.length,
              completed,
              current: analysisEnabled
                ? `已处理 ${completed}/${needAnalysis.length}：${project.name}`
                : `已保存 ${completed}/${needAnalysis.length}：${project.name}`,
            });
          }
        })
      );
    }

    const message = !analysisEnabled
      ? `AI 未配置，已保存 ${savedProjects} 个项目基础信息`
      : analysisFailures > 0
        ? `已保存 ${savedProjects} 个项目，AI 分析成功 ${analyzedProjects} 个，失败 ${analysisFailures} 个`
        : `已保存 ${savedProjects} 个项目，AI 分析完成 ${analyzedProjects} 个`;

    onProgress?.({
      phase: 'done',
      total: dedupedProjects.length,
      completed: savedProjects,
      current: message,
    });

    return {
      projectsFound: dedupedProjects.length,
      savedProjects,
      analyzedProjects,
      analysisFailures,
      skippedProjects: skipped.length,
      scannedAt: scanResult.scannedAt,
      message,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    onProgress?.({ phase: 'error', total: 0, completed: 0, error: message });
    throw err;
  }
}

interface ProcessProjectResult {
  saved: boolean;
  analyzed: boolean;
  analysisFailed: boolean;
}

async function processProject(
  project: RawProject,
  scannedAt: string,
  readme: string,
  analysisEnabled: boolean,
): Promise<ProcessProjectResult> {
  const existing = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.fullName, project.fullName))
    .get();

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
    readme: readme || existing?.readme || null,
    repoCreatedAt: project.createdAt,
    repoUpdatedAt: project.updatedAt,
    summary: existing?.summary ?? buildFallbackSummary(project),
    analysis: existing?.analysis ?? buildFallbackAnalysis(project),
    score: existing?.score ?? computeProjectScore(project, ''),
    discoveredAt: existing?.discoveredAt ?? scannedAt,
    analyzedAt: existing?.analyzedAt ?? null,
  };

  let tagNames = extractTags(project, existing?.analysis ?? '');
  let analyzed = false;
  let analysisFailed = false;

  if (analysisEnabled) {
    try {
      const analysis = await analyzeProject(project, readme);
      record.summary = analysis.summary;
      record.analysis = analysis.analysis;
      record.score = analysis.score;
      record.analyzedAt = new Date().toISOString();
      tagNames = analysis.tags;
      analyzed = true;
    } catch (err) {
      analysisFailed = true;
      console.error(`AI analysis failed for ${project.fullName}`, err);
    }
  }

  if (existing) {
    await db.update(schema.projects)
      .set(record)
      .where(eq(schema.projects.id, existing.id))
      .run();
  } else {
    await db.insert(schema.projects).values(record).run();
  }

  await upsertProjectTags(record.id, tagNames);

  return {
    saved: true,
    analyzed,
    analysisFailed,
  };
}

async function upsertProjectTags(projectId: string, tagNames: string[]) {
  for (const tagName of tagNames) {
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
        .where(eq(schema.projectTags.projectId, projectId))
        .all();
      const existingLink = links.find(pt => pt.tagId === tag!.id);

      if (!existingLink) {
        await db.insert(schema.projectTags)
          .values({ projectId, tagId: tag.id })
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
      analysis: schema.projects.analysis,
      score: schema.projects.score,
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

          const refreshedProject: RawProject = {
            name: detail.name,
            fullName: detail.full_name,
            url: detail.html_url,
            description: detail.description,
            stars: detail.stargazers_count,
            forks: detail.forks_count,
            language: detail.language,
            topics: detail.topics,
            createdAt: detail.created_at,
            updatedAt: detail.updated_at,
          };

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
              score: project.analysis
                ? computeProjectScore(refreshedProject, project.analysis)
                : project.score,
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
