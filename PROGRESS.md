# 开发进度日志

## 2026-03-03（Day 1）— Phase 1 MVP 搭建

### 已完成

#### 1. 项目初始化
- [x] create-next-app（Next.js 16, TypeScript, TailwindCSS 4, App Router, src 目录）
- [x] 安装核心依赖：openai, better-sqlite3, drizzle-orm, @modelcontextprotocol/sdk, zod, uuid
- [x] 安装开发依赖：drizzle-kit, @types/better-sqlite3, @types/uuid
- [x] shadcn/ui 初始化 + 安装组件（button, card, badge, input, textarea, scroll-area, separator, skeleton, tabs）
- [x] 配置 .env.local 模板

#### 2. 数据库层
- [x] Drizzle Schema 定义（5 张表：projects, tags, project_tags, bookmarks, chat_history）
- [x] SQLite 连接配置
- [x] drizzle-kit generate + push 完成初始化

#### 3. LLM 封装（src/lib/llm.ts + config.ts）
- [x] 多供应商支持（DashScope / DeepSeek / OpenAI）
- [x] 每个 Agent 可选择不同的 provider + model
- [x] 支持 tier（fast/smart）自动选择模型
- [x] 流式和非流式调用
- [x] 辅助函数（systemMessage, userMessage, assistantMessage）

#### 4. GitHub MCP Server
- [x] tools.ts：searchRepos, getTrendingAIRepos, getRepoReadme, getRepoDetail, getRepoReleases
- [x] server.ts：完整的 MCP Server，注册了 5 个 Tools

#### 5. Agent 系统
- [x] Scout Agent：扫描 GitHub Trending + 多话题搜索，用 LLM 筛选有价值项目
- [x] Analyst Agent：加载 Skills 进行深度分析，自动打标签和评分
- [x] Advisor Agent：基于本地知识库的对话问答，支持 SSE 流式输出
- [x] Orchestrator：串联 Scout→Analyst 全流程，支持进度回调

#### 6. Skills 系统
- [x] Skill 接口定义（name, description, systemPrompt, buildUserPrompt）
- [x] repo-reader Skill：GitHub 仓库深度分析
- [x] summarizer Skill：中文摘要生成
- [x] comparator Skill：项目横向对比
- [x] Skill 注册中心（index.ts）

#### 7. API Routes
- [x] POST /api/scan — 触发全流程扫描
- [x] GET /api/projects — 项目列表（支持 tag/search/limit/offset）
- [x] GET /api/projects/[id] — 项目详情 + 标签 + 收藏状态
- [x] POST /api/chat — Advisor Agent SSE 流式对话
- [x] GET /api/tags — 所有标签列表
- [x] POST /api/bookmarks — 收藏/取消收藏切换

#### 8. 前端页面
- [x] 根布局：Navbar + 全局样式
- [x] 首页 Feed：项目卡片网格 + 搜索框 + 标签筛选 + 扫描按钮 + 加载骨架屏
- [x] 项目详情页：基本信息 + AI 摘要 + 深度分析 + 收藏 + GitHub 链接
- [x] 对话页：聊天界面 + SSE 流式接收 + 快捷问题模板 + 打字动画

#### 9. 构建验证
- [x] `next build` 零错误通过

### 当前状态
- Phase 1 代码全部完成
- 需要填入 DASHSCOPE_API_KEY 和 GITHUB_TOKEN 才能实际运行
- 数据库文件在 data/ai-radar.db

---

## 待办（后续 Phase）

### Phase 2 — 个性化 + 知识库
- [ ] knowledge-mcp Server（收藏、笔记、语义搜索）
- [ ] 向量存储（pgvector 或 ChromaDB），支持语义相似度搜索
- [ ] Advisor Agent 增强：基于收藏历史做个性化推荐
- [ ] 对话历史持久化到 chat_history 表
- [ ] 兴趣标签管理

### Phase 3 — 自动化 + 体验打磨
- [ ] Figma 设计 Dashboard UI → 实现
- [ ] 定时自动扫描（node-cron 或 Vercel Cron）
- [ ] Agent Teams 编排优化（并行分析、错误重试、限流）
- [ ] 消息推送（微信/Telegram/邮箱）
- [ ] 周报/月报自动生成
- [ ] 导出到 Notion / Obsidian
- [ ] 多模型路由优化（成本控制）
- [ ] 更多数据源（Hacker News, arxiv, 技术博客）
