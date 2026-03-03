import type { AgentConfig, ScanResult, RawProject } from './types';
import { getTrendingAIRepos, searchRepos } from '../mcp/github/tools';
import { APP_CONFIG } from '../config';
import { chat, systemMessage, userMessage } from '../llm';

const config: AgentConfig = {
  name: 'Scout',
  role: '情报侦察兵',
  provider: 'dashscope',
  model: 'qwen-turbo',
  systemPrompt: `你是 AI Radar 的情报侦察兵。你的任务是从搜索结果中筛选出真正有价值的 AI 相关项目。

筛选标准：
1. 必须与 AI/LLM/Agent/MCP/RAG 等方向相关
2. 优先选择有创新性的项目
3. 过滤掉 awesome-list 类纯收集型仓库（除非特别优质）
4. 过滤掉明显的教程/课程类仓库（除非特别优质）

你会收到一组项目信息，请返回你认为值得深入分析的项目名称列表。
只输出 JSON 数组，格式：["owner/repo1", "owner/repo2", ...]`,
};

export async function runScout(): Promise<ScanResult> {
  const trendingRepos = await getTrendingAIRepos();

  const extraQueries = APP_CONFIG.githubTopics.slice(0, 3).map(
    topic => `topic:${topic} stars:>50 pushed:>${getRecentDate(7)}`
  );

  const extraResults = [];
  for (const q of extraQueries) {
    try {
      const repos = await searchRepos(q, 'updated', 10);
      extraResults.push(...repos);
    } catch {
      // continue on error
    }
  }

  const allRepos = dedup([...trendingRepos, ...extraResults]);

  const repoSummary = allRepos.map(r => ({
    name: r.full_name,
    description: r.description,
    stars: r.stargazers_count,
    topics: r.topics,
  }));

  let filteredNames: string[];
  try {
    const response = await chat({
      messages: [
        systemMessage(config.systemPrompt),
        userMessage(JSON.stringify(repoSummary, null, 2)),
      ],
      provider: config.provider,
      model: config.model,
    });

    const cleaned = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    filteredNames = JSON.parse(cleaned);
  } catch {
    filteredNames = allRepos.slice(0, APP_CONFIG.maxProjectsPerScan).map(r => r.full_name);
  }

  const filteredSet = new Set(filteredNames);
  const projects: RawProject[] = allRepos
    .filter(r => filteredSet.has(r.full_name))
    .slice(0, APP_CONFIG.maxProjectsPerScan)
    .map(r => ({
      name: r.name,
      fullName: r.full_name,
      url: r.html_url,
      description: r.description,
      stars: r.stargazers_count,
      forks: r.forks_count,
      language: r.language,
      topics: r.topics,
    }));

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
