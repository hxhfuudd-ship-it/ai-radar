import type { AgentConfig } from './types';
import { db, schema } from '../db';
import { desc, like, or } from 'drizzle-orm';
import { chatStream, systemMessage, userMessage, assistantMessage } from '../llm';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const config: AgentConfig = {
  name: 'Advisor',
  role: '个人顾问',
  provider: 'dashscope',
  model: 'qwen-plus',
  systemPrompt: `你是 AI Radar 的个人技术顾问。你帮助用户了解最新的 AI 技术动态。

你的知识库中有用户收集的 AI 项目数据。当用户提问时：
1. 优先基于知识库中的项目数据回答
2. 如果知识库中没有相关内容，基于你的通用知识回答并说明
3. 用中文回答
4. 回答要简洁实用，避免空泛
5. 适当引用具体的项目名称和链接`,
};

export async function chatWithAdvisor(
  userInput: string,
  history: ChatCompletionMessageParam[] = [],
) {
  const context = await searchRelevantProjects(userInput);

  const contextText = context.length > 0
    ? `\n\n以下是知识库中的相关项目：\n${context.map(p =>
        `- **${p.name}** (${p.url}): ${p.summary ?? p.description ?? '无描述'}\nStars: ${p.stars} | Tags: ${p.topics}`
      ).join('\n\n')}`
    : '';

  const messages: ChatCompletionMessageParam[] = [
    systemMessage(config.systemPrompt + contextText),
    ...history.slice(-10),
    userMessage(userInput),
  ];

  return chatStream({
    messages,
    provider: config.provider,
    model: config.model,
    stream: true,
  });
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
      .limit(5);
  }

  const conditions = keywords.map(kw =>
    or(
      like(schema.projects.name, `%${kw}%`),
      like(schema.projects.description, `%${kw}%`),
      like(schema.projects.topics, `%${kw}%`),
      like(schema.projects.summary, `%${kw}%`),
    )
  );

  return db
    .select()
    .from(schema.projects)
    .where(or(...conditions))
    .orderBy(desc(schema.projects.stars))
    .limit(10);
}
