# AI Radar — 个人 AI 技术雷达

自动追踪 GitHub 上最新的 AI 项目和技术动态，由多 Agent 协作完成情报收集、深度分析和个性化推荐。

## 技术栈

- **框架**: Next.js 16 (App Router, Turbopack)
- **语言**: TypeScript
- **UI**: TailwindCSS 4 + shadcn/ui
- **数据库**: SQLite (better-sqlite3) + Drizzle ORM
- **LLM**: 火山引擎 Coding Plan（OpenAI 兼容格式）
- **MCP**: @modelcontextprotocol/sdk

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
# 编辑 .env.local，填入 CUSTOM_BASE_URL、CUSTOM_API_KEY 和 GITHUB_TOKEN

# 3. 初始化数据库
npx drizzle-kit push

# 4. 启动开发服务器
npm run dev

# 5. 打开 http://localhost:3000
```

## 项目结构

```
src/
├── app/                        # Next.js App Router
│   ├── page.tsx                # 首页 Feed（项目卡片 + 搜索 + 标签筛选）
│   ├── project/[id]/page.tsx   # 项目详情（AI 摘要 + 深度分析）
│   ├── bookmarks/page.tsx      # 我的收藏（收藏列表 + 笔记）
│   ├── chat/page.tsx           # 对话页（与 Advisor Agent 聊天）
│   ├── layout.tsx              # 根布局（Navbar + 全局样式）
│   └── api/
│       ├── scan/route.ts       # POST - 触发扫描  GET - 扫描进度
│       ├── projects/route.ts   # GET - 项目列表（tag/search 过滤）
│       ├── projects/[id]/      # GET - 项目详情 + 标签 + 收藏状态
│       ├── chat/route.ts       # POST - Advisor SSE 流式对话
│       ├── tags/route.ts       # GET - 标签列表
│       └── bookmarks/route.ts  # GET/POST/PATCH - 收藏管理
├── components/
│   ├── Navbar.tsx              # 顶部导航栏（发现 / 收藏 / 对话）
│   ├── ProjectCard.tsx         # 项目卡片
│   ├── ScanButton.tsx          # 扫描按钮 + 进度条
│   ├── ChatPanel.tsx           # 聊天面板（SSE 流式）
│   └── ui/                     # shadcn/ui 基础组件
└── lib/
    ├── config.ts               # 全局配置（扫描参数、AI 话题）
    ├── llm.ts                  # LLM 统一封装（多供应商、流式/非流式）
    ├── scan-state.ts           # 扫描状态管理
    ├── utils.ts                # 工具函数
    ├── db/
    │   ├── schema.ts           # Drizzle Schema（5 张表）
    │   └── index.ts            # SQLite 连接
    ├── mcp/github/
    │   ├── tools.ts            # GitHub API 封装
    │   └── server.ts           # GitHub MCP Server
    ├── agents/
    │   ├── types.ts            # Agent 类型定义
    │   ├── scout.ts            # Scout — 搜索 GitHub + 本地打分筛选
    │   ├── analyst.ts          # Analyst — 深度分析 + 摘要
    │   ├── advisor.ts          # Advisor — 对话顾问，可委派 Analyst
    │   └── orchestrator.ts     # 编排器 — 串联 Scout → Analyst
    └── skills/
        ├── types.ts            # Skill 接口
        ├── index.ts            # Skill 注册中心
        ├── repo-reader.ts      # 仓库深度分析
        ├── summarizer.ts       # 中文摘要生成
        └── comparator.ts       # 项目横向对比
```

## Agent 协作

| Agent | 模型 | 职责 |
|-------|------|------|
| Scout | 无 LLM（本地打分） | 搜索 GitHub，本地打分筛选 |
| Analyst | doubao-seed-2.0-code | 深度分析项目（README → 报告 + 摘要） |
| Advisor | kimi-k2.5 | 对话顾问，可委派 Analyst 做即时分析 |

```
用户点击「扫描」
    ↓
Scout — 搜索 GitHub（created:> 只搜新项目）→ 本地打分筛选（秒级）
    ↓
Orchestrator — 预取 README（8 并发）→ 分派 Analyst（5 并发）
    ↓
Analyst — 深度分析 + 摘要 → 自动打标签 + 评分 → 存入 SQLite
    ↓
前端 Feed 展示（进度条 + 骨架屏）
```

## 数据库

| 表 | 说明 |
|----|------|
| projects | 项目元数据 + AI 摘要和分析 |
| tags | 标签 |
| project_tags | 项目-标签关联 |
| bookmarks | 收藏（含笔记） |
| chat_history | 对话历史 |
