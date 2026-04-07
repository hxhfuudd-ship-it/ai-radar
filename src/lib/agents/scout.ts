import type { ScanResult, RawProject } from './types';
import { getTrendingAIRepos, searchRepos } from '../mcp/github/tools';
import { APP_CONFIG } from '../config';
import { updateScanStatus } from '../scan-state';

const AI_KEYWORDS = /\b(llm|agent|mcp|rag|langchain|gpt|openai|claude|gemini|embedding|vector|fine.?tun|prompt|diffusion|transformer|neural|deep.?learn|machine.?learn|nlp|chatbot|copilot|ai.?code)\b/i;

const BLOCKLIST = /\b(awesome-list|awesome|interview|cheatsheet|roadmap)\b/i;

interface RepoForRank {
  description: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  full_name: string;
  updated_at: string;
  created_at: string;
}

function starsPerDay(repo: RepoForRank): number {
  const age = Math.max(1, (Date.now() - new Date(repo.created_at).getTime()) / 86_400_000);
  return repo.stargazers_count / age;
}

function scoreHotRepo(repo: RepoForRank): number {
  let score = 0;
  const text = `${repo.full_name} ${repo.description ?? ''} ${repo.topics.join(' ')}`;

  if (AI_KEYWORDS.test(text)) score += 3;

  if (repo.stargazers_count > 5000) score += 3;
  else if (repo.stargazers_count > 1000) score += 2;
  else if (repo.stargazers_count > 100) score += 1;

  const velocity = starsPerDay(repo);
  if (velocity > 100) score += 5;
  else if (velocity > 30) score += 4;
  else if (velocity > 10) score += 3;
  else if (velocity > 3) score += 2;

  if (repo.topics.length >= 3) score += 1;
  if (repo.description && repo.description.length > 30) score += 1;

  if (BLOCKLIST.test(text)) score -= 3;

  return score;
}

function scoreRecommendedRepo(repo: RepoForRank): number {
  let score = scoreHotRepo(repo);

  if (repo.stargazers_count > 20000) score += 4;
  else if (repo.stargazers_count > 5000) score += 3;
  else if (repo.stargazers_count > 1500) score += 2;

  if (repo.forks_count > 2000) score += 2;
  else if (repo.forks_count > 300) score += 1;

  const daysSinceUpdate = (Date.now() - new Date(repo.updated_at).getTime()) / 86_400_000;
  if (daysSinceUpdate < 30) score += 3;
  else if (daysSinceUpdate < 90) score += 2;
  else if (daysSinceUpdate < 180) score += 1;
  else if (daysSinceUpdate > 365) score -= 2;

  return score;
}

export async function runScout(): Promise<ScanResult> {
  updateScanStatus({ current: '搜索 GitHub Trending...' });
  const hotWindowDays = APP_CONFIG.hotProjectWindowDays;
  const createdSince = getRecentDate(hotWindowDays);
  const trendingRepos = await getTrendingAIRepos(hotWindowDays);
  updateScanStatus({ current: `找到 ${trendingRepos.length} 个热门仓库，补充搜索中...` });

  const extraQueries = APP_CONFIG.githubTopics.slice(0, 4).map(
    topic => `topic:${topic} stars:>10 created:>${createdSince}`
  );
  const extraSettled = await Promise.allSettled(
    extraQueries.map(q => searchRepos(q, 'updated', 10))
  );
  const extraResults = extraSettled
    .filter((r): r is PromiseFulfilledResult<typeof trendingRepos> => r.status === 'fulfilled')
    .flatMap(r => r.value);

  const hotRepos = dedup([...trendingRepos, ...extraResults]);
  updateScanStatus({ current: `热榜池共 ${hotRepos.length} 个候选，正在构建推荐池...` });

  const recommendedQueries = APP_CONFIG.githubTopics.map(
    topic =>
      `topic:${topic} stars:>${APP_CONFIG.recommendedProjectMinStars} pushed:>${getRecentDate(APP_CONFIG.recommendedProjectActiveWindowDays)}`
  );
  const recommendedSettled = await Promise.allSettled(
    recommendedQueries.map(q => searchRepos(q, 'stars', 10))
  );
  const recommendedResults = recommendedSettled
    .filter((r): r is PromiseFulfilledResult<typeof trendingRepos> => r.status === 'fulfilled')
    .flatMap(r => r.value);

  const recommendedRepos = dedup(recommendedResults);
  updateScanStatus({
    current: `热榜候选 ${hotRepos.length} 个，推荐池候选 ${recommendedRepos.length} 个，正在本地打分筛选...`,
  });

  const hotRanked = hotRepos
    .map(r => ({ repo: r, score: scoreHotRepo(r) }))
    .filter(s => s.score >= 3)
    .sort((a, b) =>
      b.score - a.score ||
      b.repo.stargazers_count - a.repo.stargazers_count ||
      b.repo.forks_count - a.repo.forks_count
    )
    .slice(0, APP_CONFIG.maxHotProjectsPerScan);

  const recommendedRanked = recommendedRepos
    .map(r => ({ repo: r, score: scoreRecommendedRepo(r) }))
    .filter(s => s.score >= 5)
    .sort((a, b) =>
      b.score - a.score ||
      b.repo.stargazers_count - a.repo.stargazers_count ||
      b.repo.forks_count - a.repo.forks_count
    )
    .slice(0, APP_CONFIG.maxRecommendedProjectsPerScan);

  const projects: RawProject[] = dedupProjects([
    ...hotRanked.map(({ repo: r }) => toRawProject(r)),
    ...recommendedRanked.map(({ repo: r }) => toRawProject(r)),
  ]);

  updateScanStatus({
    current: `热榜入选 ${hotRanked.length} 个，推荐池入选 ${recommendedRanked.length} 个，合并后 ${projects.length} 个项目`,
  });

  return {
    projects,
    scannedAt: new Date().toISOString(),
  };
}

function toRawProject(r: {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  created_at: string;
  updated_at: string;
}): RawProject {
  return {
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

function dedupProjects(projects: RawProject[]): RawProject[] {
  const seen = new Set<string>();
  return projects.filter(project => {
    if (seen.has(project.fullName)) return false;
    seen.add(project.fullName);
    return true;
  });
}
