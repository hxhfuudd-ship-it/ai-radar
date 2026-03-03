import type { Skill } from './types';

export const repoReaderSkill: Skill = {
  name: 'repo-reader',
  description: '深度分析一个 GitHub 仓库，提取核心信息和技术亮点',
  systemPrompt: `你是一位资深的 AI 技术分析师。你的任务是分析 GitHub 项目并生成结构化的中文技术报告。

要求：
1. 用中文输出
2. 分析要客观、专业
3. 重点关注：项目解决了什么问题、核心技术方案、与同类项目的差异化
4. 如果是 AI 相关项目，关注其在 Agent/MCP/RAG/LLM 等方向的创新点`,

  buildUserPrompt: (input) => {
    return `请分析以下 GitHub 项目：

## 基本信息
- 名称：${input.name}
- 地址：${input.url}
- Stars：${input.stars}
- 语言：${input.language}
- 标签：${input.topics}
- 描述：${input.description}

## README 内容
${input.readme}

---

请输出以下结构的分析报告：

### 一句话总结
（50字以内概括这个项目）

### 核心功能
（列出 3-5 个核心功能点）

### 技术亮点
（这个项目有什么技术创新或独特之处）

### 适用场景
（谁会用这个项目，解决什么问题）

### 值得关注的原因
（为什么这个项目值得关注）`;
  },
};
