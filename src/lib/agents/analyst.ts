import type { AgentConfig, AnalysisResult, RawProject } from './types';
import { getRepoReadme } from '../mcp/github/tools';
import { getSkill } from '../skills';
import { chat, systemMessage, userMessage } from '../llm';

const config: AgentConfig = {
  name: 'Analyst',
  role: '技术分析师',
  provider: 'dashscope',
  model: 'qwen-plus',
  systemPrompt: '你是 AI Radar 的技术分析师。',
};

export async function analyzeProject(project: RawProject): Promise<AnalysisResult> {
  const readme = await getRepoReadme(project.fullName);

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
    }),
    chat({
      messages: [
        systemMessage(summarizerSkill.systemPrompt),
        userMessage(summarizerSkill.buildUserPrompt(input)),
      ],
      provider: summarizerSkill.provider ?? config.provider,
      tier: 'fast',
    }),
  ]);

  const tags = extractTags(project, analysis);
  const score = computeScore(project, analysis);

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

function computeScore(project: RawProject, _analysis: string): number {
  let score = 0;
  if (project.stars > 1000) score += 3;
  else if (project.stars > 100) score += 2;
  else if (project.stars > 10) score += 1;

  if (project.topics.length > 3) score += 1;
  if (project.description && project.description.length > 50) score += 1;

  return Math.min(score, 5);
}
