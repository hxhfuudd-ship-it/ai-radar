import type { AgentConfig, AnalysisResult, RawProject } from './types';
import { defaultProvider, getProviderConfig, type LLMProvider } from '../config';
import { getSkill } from '../skills';
import { chat, systemMessage, userMessage } from '../llm';

const config: AgentConfig = {
  name: 'Analyst',
  role: '技术分析师',
  provider: 'custom',
  model: process.env.ANALYST_MODEL || 'deepseek-chat',
  systemPrompt: '你是 AI Radar 的技术分析师。',
};

function hasUsableModel(provider: LLMProvider, model: string): boolean {
  const providerConfig = getProviderConfig(provider);

  if (!providerConfig.apiKey.trim()) return false;
  if (!model.trim()) return false;
  if (provider === 'custom' && !providerConfig.baseURL.trim()) return false;

  return true;
}

export function canAnalyzeProject(): boolean {
  const readerSkill = getSkill('repo-reader');
  const summarizerSkill = getSkill('summarizer');

  if (!readerSkill || !summarizerSkill) return false;

  const readerProvider = readerSkill.provider ?? config.provider ?? defaultProvider;
  const readerModel = readerSkill.model ?? config.model ?? '';
  const summarizerProvider = summarizerSkill.provider ?? config.provider ?? defaultProvider;
  const summarizerConfig = getProviderConfig(summarizerProvider);
  const summarizerModel = summarizerSkill.model ?? summarizerConfig.models.fast;

  return hasUsableModel(readerProvider, readerModel) && hasUsableModel(summarizerProvider, summarizerModel);
}

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

export function buildFallbackSummary(project: RawProject): string {
  const parts = [
    project.description?.trim(),
    project.language ? `主要语言：${project.language}` : null,
    project.topics.length > 0 ? `标签：${project.topics.slice(0, 4).join(' / ')}` : null,
    `GitHub 数据：${project.stars} Stars，${project.forks} Forks。`,
  ].filter(Boolean);

  return parts.join(' ');
}

export function buildFallbackAnalysis(project: RawProject): string {
  const lines = [
    'AI 分析暂不可用，当前展示的是基于 GitHub 元数据生成的基础档案。',
    `项目名称：${project.fullName}`,
    `仓库地址：${project.url}`,
    project.description ? `项目描述：${project.description}` : '项目描述：仓库未提供描述。',
    `社区热度：${project.stars} Stars，${project.forks} Forks。`,
    project.language ? `主要语言：${project.language}` : null,
    project.topics.length > 0 ? `标签：${project.topics.join(', ')}` : null,
    `仓库创建时间：${new Date(project.createdAt).toLocaleDateString('zh-CN')}`,
    `最近更新时间：${new Date(project.updatedAt).toLocaleDateString('zh-CN')}`,
  ].filter(Boolean);

  return lines.join('\n');
}

export function extractTags(project: RawProject, analysis: string): string[] {
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
