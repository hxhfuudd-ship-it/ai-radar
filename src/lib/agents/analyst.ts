import type { AgentConfig, AnalysisResult, RawProject } from './types';
import { getSkill } from '../skills';
import { chat, systemMessage, userMessage } from '../llm';

const config: AgentConfig = {
  name: 'Analyst',
  role: '技术分析师',
  provider: 'custom',
  model: process.env.ANALYST_MODEL || 'deepseek-v3.2',
  systemPrompt: '你是 AI Radar 的技术分析师。',
};

export async function analyzeProject(project: RawProject, readme: string): Promise<AnalysisResult> {

  const readerSkill = getSkill('repo-reader')!;
  const summarizerSkill = getSkill('summarizer')!;

  const input = {
    name: project.fullName,
    url: project.url,
    stars: String(project.stars),
    language: project.language ?? 'Unknown',
    topics: project.topics.join(', '),
    description: project.description ?? '',
    readme,
  };

  const [analysis, summary] = await Promise.all([
    chat({
      messages: [
        systemMessage(readerSkill.systemPrompt),
        userMessage(readerSkill.buildUserPrompt(input)),
      ],
      provider: readerSkill.provider ?? config.provider,
      model: readerSkill.model ?? config.model,
      maxTokens: 3072,
    }),
    chat({
      messages: [
        systemMessage(summarizerSkill.systemPrompt),
        userMessage(summarizerSkill.buildUserPrompt(input)),
      ],
      provider: summarizerSkill.provider ?? config.provider,
      tier: 'fast',
      maxTokens: 512,
    }),
  ]);

  const tags = extractTags(project, analysis);
  const score = computeProjectScore(project, analysis);

  return {
    projectId: project.fullName,
    summary,
    analysis,
    tags,
    score,
  };
}

function extractTags(project: RawProject, analysis: string): string[] {
  const tagSet = new Set<string>();

  for (const topic of project.topics) {
    tagSet.add(topic.toLowerCase());
  }

  const keywords: [RegExp, string][] = [
    [/\bagent\b/i, 'agent'],
    [/\bmcp\b|model.context.protocol/i, 'mcp'],
    [/\brag\b|retrieval.augmented/i, 'rag'],
    [/\bllm\b|large.language/i, 'llm'],
    [/\blangchain\b/i, 'langchain'],
    [/\bmulti.agent/i, 'multi-agent'],
    [/\bfine.?tun/i, 'fine-tuning'],
    [/\bprompt/i, 'prompt-engineering'],
    [/\bvector\b|embedding/i, 'embedding'],
    [/\btool.?use|function.?call/i, 'tool-use'],
  ];

  const text = `${project.description ?? ''} ${analysis}`;
  for (const [pattern, tag] of keywords) {
    if (pattern.test(text)) tagSet.add(tag);
  }

  return Array.from(tagSet).slice(0, 10);
}

export function computeProjectScore(project: RawProject, analysis: string): number {
  let score = 0;

  // Star 热度
  if (project.stars > 20000) score += 6;
  else if (project.stars > 5000) score += 5;
  else if (project.stars > 1500) score += 4;
  else if (project.stars > 400) score += 3;
  else if (project.stars > 80) score += 2;
  else if (project.stars > 10) score += 1;

  // Fork 和社区活跃度
  if (project.forks > 2000) score += 2;
  else if (project.forks > 500) score += 1.5;
  else if (project.forks > 100) score += 1;
  else if (project.forks > 20) score += 0.5;

  // 项目信息完整度
  if (project.topics.length > 5) score += 1;
  else if (project.topics.length > 2) score += 0.5;
  if (project.description && project.description.length > 80) score += 1;
  else if (project.description && project.description.length > 30) score += 0.5;

  // 分析报告质量（内容越丰富说明项目越有料）
  if (analysis.length > 1400) score += 2;
  else if (analysis.length > 800) score += 1;
  else if (analysis.length > 400) score += 0.5;

  // 维护活跃度
  const updatedAt = new Date(project.updatedAt);
  const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate < 14) score += 1.5;
  else if (daysSinceUpdate < 60) score += 1;
  else if (daysSinceUpdate < 180) score += 0.5;
  else if (daysSinceUpdate > 365) score -= 0.5;

  // 有一定时间沉淀的成熟项目更适合放进推荐池
  const createdAt = new Date(project.createdAt);
  const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 30 && ageDays < 730) score += 0.5;

  return Math.max(1, Math.min(Math.round(score / 2.5), 5));
}
