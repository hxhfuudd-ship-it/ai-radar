import { v4 as uuid } from 'uuid';
import { runScout } from './scout';
import { analyzeProject } from './analyst';
import type { RawProject } from './types';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';

export interface ScanProgress {
  phase: 'scouting' | 'analyzing' | 'done' | 'error';
  total: number;
  completed: number;
  current?: string;
  error?: string;
}

type ProgressCallback = (progress: ScanProgress) => void;

export async function runFullScan(onProgress?: ProgressCallback) {
  try {
    onProgress?.({ phase: 'scouting', total: 0, completed: 0 });

    const scanResult = await runScout();
    const { projects } = scanResult;

    onProgress?.({
      phase: 'analyzing',
      total: projects.length,
      completed: 0,
    });

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      onProgress?.({
        phase: 'analyzing',
        total: projects.length,
        completed: i,
        current: project.fullName,
      });

      try {
        await processProject(project, scanResult.scannedAt);
      } catch (err) {
        console.error(`Failed to analyze ${project.fullName}:`, err);
      }
    }

    onProgress?.({
      phase: 'done',
      total: projects.length,
      completed: projects.length,
    });

    return { projectsFound: projects.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    onProgress?.({ phase: 'error', total: 0, completed: 0, error: message });
    throw err;
  }
}

async function processProject(project: RawProject, scannedAt: string) {
  const existing = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.fullName, project.fullName))
    .get();

  if (existing?.analyzedAt) {
    const analyzedDate = new Date(existing.analyzedAt);
    const daysSince = (Date.now() - analyzedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 3) return;
  }

  const analysis = await analyzeProject(project);

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
