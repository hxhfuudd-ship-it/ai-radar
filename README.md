# AI Radar — 个人 AI 技术雷达

自动追踪 GitHub 上最新的 AI 项目，通过模块化流水线完成项目发现、深度分析和智能问答，帮助用户快速了解 AI 技术动态。

**在线体验**: [myownproject-pi.vercel.app](https://myownproject-pi.vercel.app)

## 功能特性

- **自动扫描** — 从 GitHub 搜索最新 AI 项目，自动获取项目文档，由 AI 生成深度分析报告和摘要，按热度、活跃度、社区规模等维度自动打分
- **AI 问答** — 支持针对单个项目的深度问答，以及跨项目的全局对话，AI 结合已有分析报告与实时网络搜索进行回答，支持流式输出
- **项目浏览** — 标签筛选、关键词搜索、分页浏览，「最新最热」按真实增速排序 +「AI 推荐」按综合评分排序
- **收藏管理** — 对感兴趣的项目添加收藏和备注
- **多端访问** — 部署在 Vercel，手机浏览器直接访问

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 (App Router, Turbopack) + TypeScript |
| UI | React 19 + TailwindCSS 4 + shadcn/ui |
| 数据库 | SQLite (本地) / Turso (生产) + Drizzle ORM (@libsql/client) |
| LLM | OpenAI 兼容接口（当前使用 DeepSeek API） |
| 外部数据 | GitHub REST API + Tavily 网络搜索 |
| 渲染 | streamdown + @streamdown/cjk（流式 Markdown） |
| 部署 | Vercel (Serverless) + PWA 支持 |

## 功能特性

- **双模式浏览** — 最新最热（按真实增速排序，支持本周/本月/近3月时间筛选）/ AI 推荐（按综合评分排序）
- **自动扫描** — Scout 搜索 GitHub + 本地打分筛选，Analyst 生成深度分析报告 + 1-5 星推荐指数（含 AI 报告质量加权）
- **AI 问答** — 全局对话 + 项目问答，可委派 Analyst 即时分析，可触发 Web Search
- **收藏管理** — 收藏项目 + 添加笔记，收藏项目不会被自动清理
- **流式体验** — NDJSON 扫描进度 + SSE 对话流式输出
- **PWA 支持** — 添加到手机主屏幕，像 App 一样使用
- **响应式适配** — 移动端优化 + iOS safe-area 适配

## 快速启动

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入必要的 API Key

# 初始化数据库
npx drizzle-kit push

# 启动
npm run dev
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `DEFAULT_PROVIDER` | LLM 供应商（`custom`） |
| `CUSTOM_BASE_URL` | LLM API 地址 |
| `CUSTOM_API_KEY` | LLM API Key |
| `CUSTOM_MODEL_FAST` | 快速模型（当前 `deepseek-chat`） |
| `CUSTOM_MODEL_SMART` | 高质量模型（当前 `deepseek-chat`） |
| `ANALYST_MODEL` | 分析师模型（当前 `deepseek-chat`） |
| `ADVISOR_MODEL` | 顾问模型（当前 `deepseek-chat`） |
| `PROJECT_CHAT_MODEL` | 项目问答模型（当前 `deepseek-chat`） |
| `GITHUB_TOKEN` | GitHub API Token |
| `TAVILY_API_KEY` | 网络搜索（可选） |
| `TURSO_DATABASE_URL` | 生产数据库地址（可选） |
| `TURSO_AUTH_TOKEN` | 生产数据库 Token（可选） |

本地开发无需配置 Turso，自动回退到本地 SQLite 文件 `data/ai-radar.db`。

## 项目结构

```
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # 首页（双模式 + 分页 + 标签筛选 + 搜索）
│   ├── project/[id]/page.tsx     # 项目详情（Server Component）
│   ├── project/[id]/client.tsx   # 详情页客户端组件
│   ├── bookmarks/page.tsx        # 我的收藏（收藏列表 + 笔记）
│   ├── chat/page.tsx             # 对话页（与 Advisor Agent 聊天）
│   ├── layout.tsx                # 根布局（Navbar + PWA + safe-area）
│   └── api/
│       ├── scan/route.ts         # POST - 扫描（NDJSON 流式进度） GET - 状态
│       ├── projects/route.ts     # GET - 项目列表（tag/search/mode + 分页）
│       ├── projects/[id]/route.ts # GET - 项目详情 + 标签 + 收藏状态
│       ├── chat/route.ts         # POST - Advisor SSE 流式对话
│       ├── tags/route.ts         # GET - 标签列表（按模式过滤）
│       └── bookmarks/route.ts    # GET/POST/PATCH - 收藏管理
├── hooks/
│   └── useChatStream.ts          # 共享流式对话 hook（RAF + SSE 行缓冲）
├── components/
│   ├── BrandLogo.tsx             # 品牌 Logo 组件
│   ├── Navbar.tsx                # 顶部导航栏（发现 / 收藏 / 对话）
│   ├── ProjectCard.tsx           # 项目卡片
│   ├── ScanButton.tsx            # ScanProvider + ScanButton + ScanProgress
│   ├── ChatPanel.tsx             # 全局聊天面板
│   ├── ProjectChat.tsx           # 项目内嵌对话
│   ├── MarkdownContent.tsx       # 流式 Markdown 渲染（streamdown + cjk）
│   ├── ServiceWorkerRegister.tsx # PWA Service Worker 注册
│   └── ui/                       # shadcn/ui 基础组件
└── lib/
    ├── config.ts                 # 全局配置（扫描参数、供应商、话题）
    ├── llm.ts                    # LLM 统一封装（多供应商、流式/非流式）
    ├── search.ts                 # Tavily Web Search 封装
    ├── scan-state.ts             # 扫描状态
    ├── utils.ts                  # 工具函数
    ├── db/
    │   ├── schema.ts             # Drizzle Schema（5 张表）
    │   └── index.ts              # @libsql/client 连接（异步）
    ├── mcp/github/
    │   ├── tools.ts              # GitHub REST API 封装
    │   └── server.ts             # GitHub MCP Server
    ├── agents/
    │   ├── types.ts              # Agent 类型定义
    │   ├── scout.ts              # Scout — 搜索 GitHub + 本地打分筛选
    │   ├── analyst.ts            # Analyst — 深度分析 + 摘要
    │   ├── advisor.ts            # Advisor — 对话顾问，可委派 Analyst
    │   └── orchestrator.ts       # 编排器 — 串联 Scout → Analyst
    └── skills/
        ├── types.ts              # Skill 接口
        ├── index.ts              # Skill 注册中心
        ├── repo-reader.ts        # 仓库深度分析（500-800 字报告）
        ├── summarizer.ts         # 中文摘要（100-200 字）
        └── comparator.ts         # 项目横向对比
```

## 模块分工

| 模块 | 模型 (env) | 职责 |
|------|------------|------|
| Scout | 无 LLM（纯算法打分） | 搜索 GitHub，本地打分筛选 |
| Analyst | deepseek-chat (ANALYST_MODEL) | 深度分析项目（README → 报告 + 摘要） |
| Advisor | deepseek-chat (ADVISOR_MODEL / PROJECT_CHAT_MODEL) | 全局对话 + 项目问答，可委派 Analyst，可触发 Web Search |
| Orchestrator | — | 编排扫描流程，控制并发（8 路抓取 / 5 路分析） |

```
用户点击「扫描」
    ↓
清理过期项目 + 刷新已有项目元数据（GitHub API，stars 变化时快照旧值用于增速计算）
    ↓
Scout — 搜索 GitHub（热榜 + 推荐池）→ 本地打分筛选（秒级）
    ↓
Orchestrator — 预取 README（8 并发）→ 分派 Analyst（5 并发）
    ↓
Analyst — 深度分析 + 摘要 → 自动打标签 + 评分 → 存入数据库
    ↓
前端 Feed 展示（NDJSON 流式进度条 + 骨架屏）
```

## 数据库

| 表 | 说明 |
|----|------|
| projects | 项目元数据 + AI 摘要 + 深度分析报告 + 评分 + stars 快照（previousStars/previousStarsAt） |
| tags | 标签 |
| project_tags | 项目-标签关联 |
| bookmarks | 收藏（含笔记） |
| chat_history | 对话历史（已定义，暂未使用） |
