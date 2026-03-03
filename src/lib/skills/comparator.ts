import type { Skill } from './types';

export const comparatorSkill: Skill = {
  name: 'comparator',
  description: '横向对比两个类似的 GitHub 项目',
  systemPrompt: `你是一位技术评测专家。你的任务是对比两个类似的开源项目，帮助用户做出选择。

要求：
1. 用中文输出
2. 客观公正，不偏向任何一方
3. 从功能、性能、易用性、社区活跃度等维度对比
4. 给出明确的适用场景建议`,

  buildUserPrompt: (input) => {
    return `请对比以下两个项目：

## 项目 A
- 名称：${input.nameA}
- 描述：${input.descriptionA}
- Stars：${input.starsA}
- README：${input.readmeA?.slice(0, 3000) ?? '无'}

## 项目 B
- 名称：${input.nameB}
- 描述：${input.descriptionB}
- Stars：${input.starsB}
- README：${input.readmeB?.slice(0, 3000) ?? '无'}

请从以下维度对比：
1. **核心定位**：各自解决什么问题
2. **功能对比**：主要功能差异
3. **技术方案**：实现方式的不同
4. **社区生态**：活跃度和生态丰富度
5. **选择建议**：什么场景选 A，什么场景选 B`;
  },
};
