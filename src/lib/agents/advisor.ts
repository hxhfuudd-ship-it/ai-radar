import type { AgentConfig } from './types';
import { db, schema } from '../db';
import { desc, like, or, eq } from 'drizzle-orm';
import { chat, chatStream, systemMessage, userMessage } from '../llm';
import { getRepoReadme } from '../mcp/github/tools';
import { analyzeProject } from './analyst';
import { webSearch, detectWebSearchNeed, detectProjectChatSearch } from '../search';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { RawProject } from './types';

const advisorModel = process.env.ADVISOR_MODEL || 'kimi-k2.5';
const projectChatModel =
  process.env.PROJECT_CHAT_MODEL ||
  process.env.CUSTOM_MODEL_FAST ||
  'glm-4.7';
const projectChatMaxTokens = Number(process.env.PROJECT_CHAT_MAX_TOKENS || 768);

const config: AgentConfig = {
  name: 'Advisor',
  role: '个人顾问',
  provider: 'custom',
  model: advisorModel,
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
  stream?: AsyncIterable<{ choices: { delta: { content?: string | null } }[] }>;
  status?: string;
}

export type AdvisorEmit = (response: AdvisorResponse) => void | Promise<void>;

export interface ProjectContext {
  fullName: string;
  url: string;
  description?: string | null;
  stars?: number | null;
  language?: string | null;
  topics?: string | null;
  summary?: string | null;
  analysis?: string | null;
}

const projectChatPrompt = `你是 AI Radar 的项目顾问。用户正在查看一个具体的 AI 项目，你需要帮助他深入了解这个项目。

你的职责：
1. 基于项目的摘要、深度分析报告和基本信息回答问题
2. 帮用户理解项目的技术原理、使用场景、优缺点
3. 回答代码层面的疑问（架构、API、集成方式等）
4. 和类似项目做对比时给出客观建议
5. 用中文回答，简洁实用
6. 如果项目信息不足以回答，坦诚告知并给出你的推测`;

export async function chatWithAdvisor(
  userInput: string,
  history: ChatCompletionMessageParam[] = [],
  projectContext?: ProjectContext,
  emit?: AdvisorEmit,
): Promise<void> {
  if (projectContext) {
    return chatAboutProject(userInput, history, projectContext, emit);
  }

  const context = await searchRelevantProjects(userInput);

  let needAnalyst = false;
  let targetProjects: string[] = [];
  let task = '无';

  const ANALYST_KEYWORDS = /对比|比较|区别|VS|vs|优劣|分析一下|深度分析|详细分析|技术细节|源码|架构分析/;
  const inputLower = userInput.toLowerCase();
  const hasProjectMention = context.some(p =>
    inputLower.includes(p.name.toLowerCase()) ||
    inputLower.includes(p.fullName.toLowerCase())
  );
  const shouldRoute = ANALYST_KEYWORDS.test(userInput) && hasProjectMention;

  if (shouldRoute) {
    try {
      const routerResult = await chat({
        messages: [
          systemMessage(routerPrompt),
          userMessage(`用户问题：${userInput}\n\n知识库中相关项目：${context.map(p => `${p.fullName} - ${p.summary?.slice(0, 80)}`).join('\n')}`),
        ],
        provider: config.provider,
        tier: 'fast',
        maxTokens: 128,
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
  }

  let analystReport = '';
  if (needAnalyst && targetProjects.length > 0) {
    emit?.({ type: 'status', status: `正在调用分析师分析 ${targetProjects.join(', ')}...` });

    const reports: string[] = [];
    for (const name of targetProjects.slice(0, 3)) {
      try {
        const project = await findProjectByName(name, context);
        if (!project) continue;

        emit?.({ type: 'status', status: `分析师正在分析 ${name}...` });

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

  let webContext = '';
  const searchQuery = detectWebSearchNeed(userInput, context.map(p => p.name));
  if (searchQuery) {
    emit?.({ type: 'status', status: '正在搜索网络资料...' });
    const searchResult = await webSearch(searchQuery);
    if (searchResult) {
      webContext = `\n\n以下是从网络搜索获取的补充资料：\n${searchResult}`;
    }
  }

  emit?.({ type: 'status', status: '顾问正在组织回答...' });

  const contextText = context.length > 0
    ? `\n\n以下是知识库中的相关项目：\n${context.map(p =>
        `- **${p.fullName}** (${p.url}): ${p.summary ?? p.description ?? '无描述'}\nStars: ${p.stars} | Tags: ${p.topics}`
      ).join('\n\n')}`
    : '';

  const messages: ChatCompletionMessageParam[] = [
    systemMessage(config.systemPrompt + contextText + analystReport + webContext),
    ...history.slice(-10),
    userMessage(userInput),
  ];

  const stream = await chatStream({
    messages,
    provider: config.provider,
    model: config.model,
    stream: true,
  });

  await emit?.({ type: 'stream', stream });
}

async function chatAboutProject(
  userInput: string,
  history: ChatCompletionMessageParam[],
  project: ProjectContext,
  emit?: AdvisorEmit,
): Promise<void> {
  emit?.({ type: 'status', status: '正在理解你的问题...' });

  const analysisText = project.analysis
    ? project.analysis.slice(0, 350) + (project.analysis.length > 350 ? '...' : '')
    : '';

  // 只有对比/替代类问题才触发 web 搜索，普通问题直接调 LLM
  const searchQuery = detectProjectChatSearch(userInput, project.fullName);
  let webContext = '';
  if (searchQuery) {
    emit?.({ type: 'status', status: '正在搜索网络资料...' });
    const searchResult = await webSearch(searchQuery);
    if (searchResult) {
      webContext = `\n\n--- 网络搜索补充资料 ---\n${searchResult}`;
    }
  }

  emit?.({ type: 'status', status: '正在整理项目上下文...' });

  const projectInfo = [
    `项目：${project.fullName}`,
    `链接：${project.url}`,
    project.description && `简介：${project.description}`,
    project.stars != null && `Stars：${project.stars.toLocaleString()}`,
    project.language && `语言：${project.language}`,
    project.topics && `标签：${project.topics}`,
    project.summary && `\nAI 摘要：\n${project.summary}`,
    analysisText && `\n深度分析报告：\n${analysisText}`,
  ].filter(Boolean).join('\n');

  const messages: ChatCompletionMessageParam[] = [
    systemMessage(`${projectChatPrompt}\n\n--- 当前项目信息 ---\n${projectInfo}${webContext}`),
    ...history.slice(-6),
    userMessage(userInput),
  ];

  emit?.({ type: 'status', status: '正在生成回答草稿...' });

  const stream = await chatStream({
    messages,
    provider: config.provider,
    model: projectChatModel,
    maxTokens: Number.isFinite(projectChatMaxTokens) ? projectChatMaxTokens : 768,
    tier: 'fast',
    stream: true,
  });

  await emit?.({ type: 'stream', stream });
}

async function findProjectByName(name: string, cachedProjects: { fullName: string; [k: string]: unknown }[]) {
  const nameLower = name.toLowerCase();
  const fromCache = cachedProjects.find(p => p.fullName.toLowerCase() === nameLower);
  if (fromCache) return fromCache as typeof schema.projects.$inferSelect;

  return await db
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
    return await db
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

  return await db
    .select()
    .from(schema.projects)
    .where(or(...conditions))
    .orderBy(desc(schema.projects.stars))
    .limit(10)
    .all();
}
