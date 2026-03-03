import type { Skill } from './types';

export const summarizerSkill: Skill = {
  name: 'summarizer',
  description: '将项目信息生成简洁的中文摘要',
  systemPrompt: `你是一位技术内容编辑。你的任务是将 GitHub 项目信息浓缩为简洁的中文摘要，方便快速浏览。

要求：
1. 摘要控制在 100-200 字
2. 突出最核心的价值点
3. 用通俗易懂的语言
4. 如果涉及 AI 技术，标注其技术方向（如 Agent/MCP/RAG 等）`,

  buildUserPrompt: (input) => {
    return `请为以下项目生成中文摘要：

名称：${input.name}
描述：${input.description}
Stars：${input.stars}
语言：${input.language}
标签：${input.topics}

README 摘录：
${input.readme?.slice(0, 3000) ?? '无'}

请直接输出摘要，不需要标题或格式。`;
  },
};
