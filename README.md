# AI Radar — 个人 AI 技术雷达

自动追踪 GitHub 上最新的 AI 项目，通过多 Agent 协作完成项目发现、深度分析和智能问答，帮助用户快速了解 AI 技术动态。

**在线体验**: [myownproject-pi.vercel.app](https://myownproject-pi.vercel.app)

## 功能特性

- **自动扫描** — 从 GitHub 搜索最新 AI 项目，自动获取项目文档，由 AI 生成深度分析报告和摘要，按热度、活跃度、社区规模等维度自动打分
- **AI 问答** — 支持针对单个项目的深度问答，以及跨项目的全局对话，AI 结合已有分析报告与实时网络搜索进行回答，支持流式输出
- **项目浏览** — 标签筛选、关键词搜索、分页浏览，提供「近 90 天最热」与「AI 推荐」两种排序模式
- **收藏管理** — 对感兴趣的项目添加收藏和备注
- **多端访问** — 部署在 Vercel，手机浏览器直接访问

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 (App Router, Turbopack) + TypeScript |
| UI | React 19 + TailwindCSS 4 + shadcn/ui |
| 数据库 | SQLite (本地) / Turso (生产) + Drizzle ORM |
| LLM | OpenAI 兼容接口（DeepSeek 等） |
| 外部数据 | GitHub REST API + Tavily 网络搜索 |
| 部署 | Vercel (Serverless) |

## 多 Agent 架构

```
用户点击「扫描」
    ↓
Scout — 搜索 GitHub trending + topic，本地打分筛选（无 LLM）
    ↓
Orchestrator — 批量获取 README（8 并发）→ 分派 Analyst（5 并发）
    ↓
Analyst — 深度分析 + 摘要 → 自动打标签 + 评分 → 存入数据库
    ↓
前端 Feed 实时进度展示
```

| Agent | 职责 |
|-------|------|
| Scout | 搜索 GitHub，按 AI 关键词 + stars + forks 本地打分筛选 |
| Analyst | 读取项目 README，生成深度分析报告（500-800 字）和摘要（100-200 字） |
| Advisor | 全局对话顾问，搜索知识库回答问题，必要时委派 Analyst 做即时深度分析 |
| ProjectChat | 单项目问答，基于已有分析报告和摘要回答用户提问 |

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
| `CUSTOM_MODEL_FAST` | 快速模型 |
| `CUSTOM_MODEL_SMART` | 高质量模型 |
| `ANALYST_MODEL` | 分析师模型 |
| `ADVISOR_MODEL` | 顾问模型 |
| `PROJECT_CHAT_MODEL` | 项目问答模型 |
| `GITHUB_TOKEN` | GitHub API Token |
| `TAVILY_API_KEY` | 网络搜索（可选） |
| `TURSO_DATABASE_URL` | 生产数据库地址（可选） |
| `TURSO_AUTH_TOKEN` | 生产数据库 Token（可选） |

## 项目结构

```
src/
├── app/                        # Next.js App Router
│   ├── page.tsx                # 首页 Feed（搜索 + 标签筛选 + 分页）
│   ├── project/[id]/           # 项目详情（AI 摘要 + 深度分析 + 问答）
│   ├── bookmarks/              # 收藏列表
│   ├── chat/                   # 全局 AI 对话
│   └── api/                    # API 路由（scan/projects/tags/chat/bookmarks）
├── components/                 # UI 组件
├── hooks/                      # 自定义 Hooks（SSE 聊天流等）
└── lib/
    ├── agents/                 # Scout / Analyst / Advisor / Orchestrator
    ├── skills/                 # repo-reader / summarizer / comparator
    ├── db/                     # 数据库 Schema + 连接
    ├── mcp/github/             # GitHub API 封装
    ├── llm.ts                  # LLM 统一调用封装
    └── config.ts               # 全局配置
```

## 数据库

| 表 | 说明 |
|----|------|
| projects | 项目元数据 + AI 摘要 + 深度分析报告 + 评分 |
| tags / project_tags | 标签及项目-标签关联 |
| bookmarks | 收藏（含备注） |
| chat_history | 对话历史 |
