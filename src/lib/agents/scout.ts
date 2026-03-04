import type { ScanResult, RawProject } from './types';
import { getTrendingAIRepos, searchRepos } from '../mcp/github/tools';
import { APP_CONFIG } from '../config';
import { updateScanStatus } from '../scan-state';

const AI_KEYWORDS = /\b(llm|agent|mcp|rag|langchain|gpt|openai|claude|gemini|embedding|vector|fine.?tun|prompt|diffusion|transformer|neural|deep.?learn|machine.?learn|nlp|chatbot|copilot|ai.?code)\b/i;

const BLOCKLIST = /\b(awesome-list|awesome|interview|cheatsheet|roadmap)\b/i;

function scoreRepo(repo: { description: string | null; topics: string[]; stargazers_count: number; full_name: string }): number {
  let score = 0;
  const text = `${repo.full_name} ${repo.description ?? ''} ${repo.topics.join(' ')}`;

  if (AI_KEYWORDS.test(text)) score += 3;

  if (repo.stargazers_count > 5000) score += 3;
  else if (repo.stargazers_count > 1000) score += 2;
  else if (repo.stargazers_count > 100) score += 1;

  if (repo.topics.length >= 3) score += 1;
  if (repo.description && repo.description.length > 30) score += 1;

  if (BLOCKLIST.test(text)) score -= 3;

  return score;
}

export async function runScout(): Promise<ScanResult> {
  updateScanStatus({ current: '搜索 GitHub Trending...' });
  const trendingRepos = await getTrendingAIRepos();
  updateScanStatus({ current: `找到 ${trendingRepos.length} 个热门仓库，补充搜索中...` });

  const extraQueries = APP_CONFIG.githubTopics.slice(0, 2).map(
    topic => `topic:${topic} stars:>10 created:>${getRecentDate(30)}`
  );
  const extraSettled = await Promise.allSettled(
    extraQueries.map(q => searchRepos(q, 'updated', 10))
  );
  const extraResults = extraSettled
    .filter((r): r is PromiseFulfilledResult<typeof trendingRepos> => r.status === 'fulfilled')
    .flatMap(r => r.value);

  const allRepos = dedup([...trendingRepos, ...extraResults]);
  updateScanStatus({ current: `共 ${allRepos.length} 个候选，正在本地打分筛选...` });

  const scored = allRepos
    .map(r => ({ repo: r, score: scoreRepo(r) }))
    .filter(s => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, APP_CONFIG.maxProjectsPerScan);

  const projects: RawProject[] = scored.map(({ repo: r }) => ({
    name: r.name,
    fullName: r.full_name,
    url: r.html_url,
    description: r.description,
    stars: r.stargazers_count,
    forks: r.forks_count,
    language: r.language,
    topics: r.topics,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  updateScanStatus({ current: `筛选出 ${projects.length} 个值得分析的项目` });

  return {
    projects,
    scannedAt: new Date().toISOString(),
  };
}

function getRecentDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
}

function dedup<T extends { id: number }>(repos: T[]): T[] {
  const seen = new Set<number>();
  return repos.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}
