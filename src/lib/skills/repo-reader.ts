import type { Skill } from './types';

export const repoReaderSkill: Skill = {
  name: 'repo-reader',
  description: '深度分析一个 GitHub 仓库，提取核心信息和技术亮点',
  systemPrompt: `你是一位资深的 AI 技术分析师。你的任务是分析 GitHub 项目并生成详细的中文技术报告。

严格要求：
1. 用中文输出，纯文本格式，不要使用 Markdown 符号（不用 #、*、- 等）
2. 每个部分至少写 3-5 句话，分析要有深度和具体细节
3. 重点关注：项目解决什么问题、核心技术方案、与同类项目差异化
4. 如果是 AI 相关项目，关注 Agent/MCP/RAG/LLM 方向的创新点
5. 总字数必须在 500-800 字之间，不要太短！
6. 如果 README 信息不足，基于项目名称、描述和标签进行合理推断
7. 每个小节之间空一行，保持可读性`,

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

请输出以下结构的分析报告（使用纯文本，不要用 Markdown 符号）：

【一句话总结】
50字以内概括这个项目。

【核心功能】
列出 3-5 个核心功能点，每个功能用一句话描述。

【技术亮点】
这个项目有什么技术创新或独特之处？至少写 2-3 个亮点。

【适用场景】
谁会用这个项目？解决什么具体问题？列举 2-3 个场景。

【值得关注的原因】
为什么这个项目值得持续关注？从技术趋势、社区影响、实用性等角度分析。`;
  },
};
