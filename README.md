# AI Radar — 个人 AI 技术雷达

自动追踪 GitHub 上最新的 AI 项目和技术动态，由多 Agent 协作完成情报收集、深度分析和个性化推荐。

## 技术栈

- **框架**: Next.js 16 (App Router, Turbopack)
- **语言**: TypeScript
- **UI**: TailwindCSS 4 + shadcn/ui
- **数据库**: SQLite (better-sqlite3) + Drizzle ORM
- **LLM**: 阿里通义千问 DashScope API（OpenAI 兼容格式），支持多供应商切换
- **MCP**: @modelcontextprotocol/sdk
- **包管理**: npm

## 快速启动

```bash
# 1. 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local，填入 DASHSCOPE_API_KEY 和 GITHUB_TOKEN

# 2. 安装依赖
npm install

# 3. 初始化数据库（如果 data 目录不存在）
mkdir -p data
npx drizzle-kit push

# 4. 启动开发服务器
npm run dev

# 5. 打开 http://localhost:3000，点击「扫描最新项目」
```

## 项目架构

```
src/
├── app/                        # Next.js App Router
│   ├── page.tsx                # 首页 Feed（项目卡片 + 搜索 + 标签筛选）
│   ├── project/[id]/page.tsx   # 项目详情页（AI 摘要 + 深度分析报告）
│   ├── chat/page.tsx           # 对话页（与 Advisor Agent 实时聊天）
│   ├── layout.tsx              # 根布局（Navbar + 全局样式）
│   └── api/
│       ├── scan/route.ts       # POST - 触发 Scout→Analyst 全流程扫描
│       ├── projects/route.ts   # GET - 项目列表（支持 tag/search 过滤）
│       ├── projects/[id]/      # GET - 项目详情 + 标签 + 收藏状态
│       ├── chat/route.ts       # POST - Advisor Agent SSE 流式对话
│       ├── tags/route.ts       # GET - 所有标签
│       └── bookmarks/route.ts  # POST - 收藏/取消收藏
├── components/
│   ├── Navbar.tsx              # 顶部导航栏
│   ├── ProjectCard.tsx         # 项目卡片组件
│   ├── ChatPanel.tsx           # 聊天面板（SSE 流式接收）
│   ├── ScanButton.tsx          # 扫描触发按钮
│   └── ui/                     # shadcn/ui 基础组件
└── lib/
    ├── config.ts               # 全局配置（LLM 供应商、扫描参数、AI 话题）
    ├── llm.ts                  # LLM 统一封装（多供应商、多模型、流式/非流式）
    ├── db/
    │   ├── schema.ts           # Drizzle Schema（projects, tags, bookmarks, chat_history）
    │   └── index.ts            # SQLite 连接
    ├── mcp/github/
    │   ├── tools.ts            # GitHub API 封装（搜索、Trending、README、Release）
    │   └── server.ts           # GitHub MCP Server（5 个 Tools）
    ├── agents/
    │   ├── types.ts            # Agent 类型定义
    │   ├── scout.ts            # Scout Agent — 情报侦察（qwen-turbo）
    │   ├── analyst.ts          # Analyst Agent — 深度分析（qwen-plus）
    │   ├── advisor.ts          # Advisor Agent — 对话推荐（qwen-plus）
    │   └── orchestrator.ts     # 编排器 — 串联 Scout→Analyst，写入数据库
    └── skills/
        ├── types.ts            # Skill 接口定义
        ├── index.ts            # Skill 注册中心
        ├── repo-reader.ts      # GitHub 仓库深度分析 Skill
        ├── summarizer.ts       # 中文摘要生成 Skill
        └── comparator.ts       # 项目横向对比 Skill
```

## Agent 协作流程

```
用户点击「扫描」
    ↓
Scout Agent（qwen-turbo）
  → 调用 github-mcp 获取 Trending + 搜索 AI 项目
  → 用 LLM 筛选出有价值的项目
    ↓
Orchestrator 逐个分派
    ↓
Analyst Agent（qwen-plus）
  → 加载 repo-reader Skill → 生成深度分析
  → 加载 summarizer Skill → 生成中文摘要
  → 自动打标签 + 计算推荐分数
  → 写入 SQLite
    ↓
前端 Feed 展示

用户在对话页提问
    ↓
Advisor Agent（qwen-plus）
  → 搜索本地知识库（SQLite 关键词匹配）
  → 结合项目数据 + 通用知识
  → SSE 流式回答
```

## 多模型支持

每个 Agent 可独立配置 LLM 供应商和模型：

| Agent   | 默认供应商   | 默认模型     | 用途       |
|---------|-------------|-------------|-----------|
| Scout   | dashscope   | qwen-turbo  | 快速筛选   |
| Analyst | dashscope   | qwen-plus   | 深度分析   |
| Advisor | dashscope   | qwen-plus   | 对话问答   |

`config.ts` 中预置了 3 个供应商（DashScope / DeepSeek / OpenAI），可自由混搭。

## 数据库表

| 表名          | 说明                         |
|--------------|------------------------------|
| projects     | 项目元数据 + AI 生成的摘要和分析 |
| tags         | 标签                          |
| project_tags | 项目-标签关联                  |
| bookmarks    | 用户收藏                       |
| chat_history | 对话历史                       |
