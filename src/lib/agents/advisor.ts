import type { AgentConfig } from './types';
import { db, schema } from '../db';
import { desc, like, or, eq } from 'drizzle-orm';
import { chat, chatStream, systemMessage, userMessage } from '../llm';
import { getRepoReadme } from '../mcp/github/tools';
import { analyzeProject } from './analyst';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { RawProject } from './types';

const config: AgentConfig = {
  name: 'Advisor',
  role: '个人顾问',
  provider: 'custom',
  model: 'kimi-k2.5',
  systemPrompt: `你是 AI Radar 的个人技术顾问。你帮助用户了解最新的 AI 技术动态。

你的知识库中有用户收集的 AI 项目数据。当用户提问时：
1. 优先基于知识库中的项目数据回答
2. 如果知识库中没有相关内容，基于你的通用知识回答并说明
3. 用中文回答
4. 回答要简洁实用，避免空泛
5. 适当引用具体的项目名称和链接
6. 如果收到了 Analyst 的深度分析报告，充分利用其中的细节来回答`,
};

const routerPrompt = `判断用户问题是否需要调用 Analyst（技术分析师）进行深度分析。

需要调用的情况：
- 用户要求对比两个或多个项目
- 用户要求深度分析某个具体项目
- 用户问某个项目的技术细节，但知识库中的分析不够详细

不需要调用的情况：
- 一般性的推荐问题（"有什么好的 RAG 项目？"）
- 趋势性问题（"最近什么方向热门？"）
- 简单的信息查询

请只输出 JSON，格式：
{"needAnalyst": true/false, "projectNames": ["owner/repo1", ...], "task": "对比/分析/无"}

如果不需要调用，projectNames 为空数组，task 为 "无"。`;

export interface AdvisorResponse {
  type: 'status' | 'stream';
  stream?: AsyncIterable<{ choices: { delta: { content?: string } }[] }>;
  status?: string;
}

export async function chatWithAdvisor(
  userInput: string,
  history: ChatCompletionMessageParam[] = [],
): Promise<AdvisorResponse[]> {
  const responses: AdvisorResponse[] = [];
  const context = await searchRelevantProjects(userInput);

  // 第一步：路由判断是否需要调用 Analyst
  let needAnalyst = false;
  let targetProjects: string[] = [];
  let task = '无';

  try {
    const routerResult = await chat({
      messages: [
        systemMessage(routerPrompt),
        userMessage(`用户问题：${userInput}\n\n知识库中相关项目：${context.map(p => `${p.fullName} - ${p.summary?.slice(0, 80)}`).join('\n')}`),
      ],
      provider: config.provider,
      model: config.model,
      maxTokens: 256,
      temperature: 0.1,
    });

    const cleaned = routerResult.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    needAnalyst = parsed.needAnalyst === true;
    targetProjects = parsed.projectNames ?? [];
    task = parsed.task ?? '无';
  } catch {
    // 路由判断失败，走普通流程
  }

  // 第二步：如果需要，调用 Analyst
  let analystReport = '';
  if (needAnalyst && targetProjects.length > 0) {
    responses.push({ type: 'status', status: `正在调用分析师分析 ${targetProjects.join(', ')}...` });

    const reports: string[] = [];
    for (const name of targetProjects.slice(0, 3)) {
      try {
        const project = findProjectByName(name, context);
        if (!project) continue;

        responses.push({ type: 'status', status: `分析师正在分析 ${name}...` });

        const readme = await getRepoReadme(name);
        const raw: RawProject = {
          name: project.name,
          fullName: project.fullName,
          url: project.url,
          description: project.description,
          stars: project.stars ?? 0,
          forks: project.forks ?? 0,
          language: project.language,
          topics: project.topics?.split(',').filter(Boolean) ?? [],
          createdAt: project.repoCreatedAt ?? '',
          updatedAt: project.repoUpdatedAt ?? '',
        };
        const result = await analyzeProject(raw, readme);
        reports.push(`【${name}】\n${result.analysis}`);
      } catch (err) {
        console.error(`Analyst failed for ${name}:`, err);
      }
    }

    if (reports.length > 0) {
      analystReport = `\n\n以下是 Analyst（技术分析师）为你准备的深度分析报告：\n\n${reports.join('\n\n---\n\n')}`;
      if (task === '对比') {
        analystReport += '\n\n请基于以上分析报告，为用户做一个清晰的对比总结。';
      }
    }
  }

  // 第三步：Advisor 生成最终回答
  responses.push({ type: 'status', status: '顾问正在组织回答...' });

  const contextText = context.length > 0
    ? `\n\n以下是知识库中的相关项目：\n${context.map(p =>
        `- **${p.fullName}** (${p.url}): ${p.summary ?? p.description ?? '无描述'}\nStars: ${p.stars} | Tags: ${p.topics}`
      ).join('\n\n')}`
    : '';

  const messages: ChatCompletionMessageParam[] = [
    systemMessage(config.systemPrompt + contextText + analystReport),
    ...history.slice(-10),
    userMessage(userInput),
  ];

  const stream = await chatStream({
    messages,
    provider: config.provider,
    model: config.model,
    stream: true,
  });

  responses.push({ type: 'stream', stream });

  return responses;
}

function findProjectByName(name: string, cachedProjects: { fullName: string; [k: string]: unknown }[]) {
  const nameLower = name.toLowerCase();
  const fromCache = cachedProjects.find(p => p.fullName.toLowerCase() === nameLower);
  if (fromCache) return fromCache as typeof schema.projects.$inferSelect;

  return db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.fullName, name))
    .get();
}

async function searchRelevantProjects(query: string) {
  const keywords = query
    .replace(/[？?！!。，,.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, 5);

  if (keywords.length === 0) {
    return db
      .select()
      .from(schema.projects)
      .orderBy(desc(schema.projects.discoveredAt))
      .limit(5)
      .all();
  }

  const conditions = keywords.map(kw =>
    or(
      like(schema.projects.name, `%${kw}%`),
      like(schema.projects.description, `%${kw}%`),
      like(schema.projects.topics, `%${kw}%`),
      like(schema.projects.summary, `%${kw}%`),
      like(schema.projects.fullName, `%${kw}%`),
    )
  );

  return db
    .select()
    .from(schema.projects)
    .where(or(...conditions))
    .orderBy(desc(schema.projects.stars))
    .limit(10)
    .all();
}
