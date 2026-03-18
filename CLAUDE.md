# AI Radar — Claude Code 项目记忆

## 项目概述
个人 AI 技术雷达，扫描 GitHub 发现最新 AI 项目，多 Agent 协作分析。

## 技术栈
Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + SQLite/Turso (@libsql/client + Drizzle ORM) + OpenAI SDK

## 部署架构
- **线上**: Vercel (免费 Hobby) + Turso 云数据库 (免费 9GB)
  - 线上地址: https://myownproject-pi.vercel.app
  - GitHub 仓库: https://github.com/hxhfuudd-ship-it/ai-radar
  - Turso DB: `libsql://ai-radar-wrt123.aws-us-west-2.turso.io`
  - Vercel 项目: `hxhfuudd-2416s-projects/my_own_project`
  - **Vercel 已关联 GitHub，git push 到 main 自动部署**
  - 环境变量用 `printf 'value' | npx vercel env add NAME production`（不要用 `<<<`，会加换行符导致 Token 失效）
- **本地开发**: 本地 SQLite `data/ai-radar.db`（不配 TURSO 变量时自动回退）

## 运行
```bash
cd ~/Desktop/ai-radar && npm run dev
# 访问 http://localhost:3000
# 数据库重建: npx drizzle-kit push
# 重建 Turso 云数据库: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx drizzle-kit push
```

## LLM 供应商
**统一使用火山引擎 Coding Plan（OpenAI 兼容协议），不使用阿里 dashscope。**
- `CUSTOM_BASE_URL`: 火山引擎 API 地址
- `CUSTOM_API_KEY`: 火山引擎 API 密钥
- `DEFAULT_PROVIDER`: `custom`（代码默认值也是 custom）

### 可用模型（火山引擎 Coding Plan）
| 模型 | 特点 |
|------|------|
| `kimi-k2.5` | 中文对话强，知识面广 |
| `deepseek-v3.2` | 推理能力强，代码理解好 |
| `doubao-seed-2.0-code` | 代码专项优化 |
| `glm-4.7` | 综合均衡，速度快 |
| `doubao-seed-code` | 较老版本，基本被 2.0 取代 |

### 当前模型分配（2026-03-08 优化）
| 场景 | 模型 | 环境变量 | 理由 |
|------|------|---------|------|
| Advisor 主聊天 | `kimi-k2.5` | `ADVISOR_MODEL` | 开放式对话需要中文能力和知识面 |
| Analyst 深度分析 | `deepseek-v3.2` | `ANALYST_MODEL` | 需要强推理 + 长文本分析 |
| 项目详情聊天 | `doubao-seed-2.0-code` | `PROJECT_CHAT_MODEL` | 用户问代码/架构问题，代码模型对口 |
| 路由判断/摘要 | `glm-4.7` | `CUSTOM_MODEL_FAST` | 简单 JSON 分类/短摘要，快就行 |
| Smart 默认档 | `deepseek-v3.2` | `CUSTOM_MODEL_SMART` | 需要推理的兜底 |

## API 配置 (.env.local)
- 火山引擎: `CUSTOM_BASE_URL` + `CUSTOM_API_KEY`
- Agent 模型: `ADVISOR_MODEL`、`PROJECT_CHAT_MODEL`、`ANALYST_MODEL`
- Tavily Web Search: `TAVILY_API_KEY`（无 key 时搜索功能优雅降级）
- GitHub Token: `GITHUB_TOKEN`
- Turso 云数据库: `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`（本地开发不填，自动回退本地 SQLite）

## 架构

### 数据库 (Drizzle ORM)
- **驱动**: `@libsql/client` + `drizzle-orm/libsql`
- **连接**: `src/lib/db/index.ts` — `createClient({ url, authToken })`
- **所有 db 操作都是异步的**（`.get()`, `.all()`, `.run()` 均返回 Promise）
- 表: projects, tags, project_tags, bookmarks, chat_history

### Agent 架构
| Agent | 文件 | 模型 | 职责 |
|-------|------|------|------|
| Scout | agents/scout.ts | 无 LLM | 搜索 GitHub，本地正则打分筛选 |
| Analyst | agents/analyst.ts | deepseek-v3.2 | 深度分析 + 摘要（摘要用 fast tier） |
| Advisor | agents/advisor.ts | kimi-k2.5 / doubao-seed-2.0-code | 全局对话 + 项目问答，可委派 Analyst，可触发 Web Search |
| Orchestrator | agents/orchestrator.ts | 无 LLM | 编排 Scout → Analyst 流水线 |

### Advisor emit 回调架构（2026-03-08 重构）
- `chatWithAdvisor` 接受 `emit?: AdvisorEmit` 回调参数
- 每产生一条 status/stream 消息立即通过 `emit()` 推送到 API route 的 SSE 流
- **不再**攒成数组最后一起返回，前端能即时看到 status 消息
- API route (`/api/chat`) 在 `ReadableStream.start()` 中传入 `emit` 回调

### Web Search（Tavily，src/lib/search.ts）
- 触发条件：对比关键词、问"xxx 是什么"且不在 DB、DB 无结果、项目问答中问替代方案
- `webSearch(query)` 返回格式化上下文，拼入 system prompt
- 无 TAVILY_API_KEY 时跳过，不报错

### 扫描流程
1. Scout 搜索 GitHub → 本地打分筛选（秒级）
2. 预取 README（8 并发）
3. Analyst 分析（5 并发，每项 2 个 LLM 调用）
4. 存入数据库，自动清理 30 天旧项目和重复数据

### 扫描进度架构（NDJSON 流式）
- POST /api/scan 返回 NDJSON 流式响应
- 前端 ScanProvider 用 `reader.read()` 读取，不用 setInterval 轮询
- Vercel 无服务器环境下 POST/GET 可能打到不同实例，所以不能用内存单例

### 前端架构
- **useChatStream** (src/hooks/useChatStream.ts): RAF 批量更新，SSE 行缓冲，唯一消息 ID
- **MarkdownContent** (streamdown + @streamdown/cjk): 流式优化渲染
- **AI 思考动画**: thinking-dots、thinking-shimmer、content-appear 关键帧
- **PWA**: manifest.json + sw.js + 图标，Safari 添加主屏幕可用
- **iOS 安全区域**: Navbar `pt-[env(safe-area-inset-top,0px)]`

### 关键配置 (src/lib/config.ts)
- maxProjectsPerScan: 15
- analysisConcurrency: 5
- readmeMaxChars: 4000
- skipIfAnalyzedWithinDays: 1

## 已完成功能
- [x] GitHub 扫描 + 本地打分筛选
- [x] 深度分析 + 摘要生成
- [x] 推荐指数评分排序
- [x] 进度条（流式 NDJSON + 平滑动画 + 4 阶段）
- [x] Agent Teams：Advisor 委派 Analyst 即时分析
- [x] 自动清理旧项目 + 重复去重
- [x] 收藏功能 + 笔记 + 收藏页面
- [x] 对话页面（流式输出）
- [x] 项目详情页 AI 问答（带项目上下文的对话）
- [x] useChatStream hook 抽取
- [x] MarkdownContent 动态导入
- [x] Navbar（图标 + 移动端汉堡菜单 + active 指示器）
- [x] PWA 支持
- [x] 数据库迁移: better-sqlite3 → @libsql/client (Turso 兼容)
- [x] Vercel 部署 + Turso 云数据库
- [x] 扫描架构: 内存轮询 → NDJSON 流式响应
- [x] iPhone 顶部安全区域适配
- [x] 流式渲染: react-markdown → streamdown
- [x] AI 思考动画
- [x] 模型分配环境变量化
- [x] Tavily Web Search 集成
- [x] 模型优化：统一火山引擎，去掉 dashscope 依赖，项目聊天改用 doubao-seed-2.0-code
- [x] Vercel 关联 GitHub 仓库，git push 自动部署
- [x] Advisor emit 回调架构，status 消息即时推送
- [x] 项目聊天性能优化：analysis 截断 2000→1000，maxTokens 4096→2048，历史 10→6 条

## 待完成
- [ ] Advisor 优先参考收藏项目
- [ ] 更丰富的 Agent 间信息传递
- [ ] 定时自动扫描
- [ ] 绑定自定义域名（国内访问 vercel.app 可能慢）

## 踩过的坑

### Vercel 无服务器扫描状态丢失
- **问题**: 内存单例 POST/GET 打到不同实例，GET 读到默认 idle
- **解决**: NDJSON 流式响应，所有数据在同一个请求连接内传递

### iOS safe-area 重叠
- **问题**: `viewportFit: 'cover'` 让页面延伸到状态栏但 Navbar 没加顶部安全距离
- **解决**: Navbar 加 `pt-[env(safe-area-inset-top,0px)]`

### Vercel 环境变量换行符
- **问题**: `<<<` 会在值末尾加换行符导致 Token 失效
- **解决**: 用 `printf 'value' | npx vercel env add NAME production`

## Turso CLI 常用命令
```bash
source ~/.zshrc  # 加载 turso 到 PATH
turso db shell ai-radar  # 交互式 SQL
turso db shell ai-radar ".tables"
turso db shell ai-radar "SELECT COUNT(*) FROM projects;"
turso db show ai-radar --url
turso db tokens create ai-radar
```

## 项目文件结构
```
src/
├── hooks/useChatStream.ts      # 共享的流式对话 hook
├── components/
│   ├── ServiceWorkerRegister.tsx # PWA SW 注册
│   ├── Navbar.tsx               # 导航栏（含移动端菜单 + safe-area）
│   ├── ChatPanel.tsx            # 全局对话
│   ├── ProjectChat.tsx          # 项目内嵌对话
│   ├── MarkdownContent.tsx      # Markdown 流式渲染
│   ├── ProjectCard.tsx          # 项目卡片
│   └── ScanButton.tsx           # 扫描组件（流式进度）
├── app/
│   ├── layout.tsx               # PWA metadata + viewport + safe-area
│   ├── globals.css              # 触摸优化 + safe-area + 动画
│   ├── page.tsx                 # 首页
│   ├── chat/page.tsx            # 对话页
│   ├── bookmarks/page.tsx       # 收藏页
│   ├── project/[id]/page.tsx    # 项目详情页
│   └── api/
│       ├── scan/route.ts        # 扫描 API（NDJSON 流式）
│       ├── chat/route.ts        # 聊天 API（SSE 流式 + emit 回调）
│       ├── projects/route.ts    # 项目列表
│       ├── projects/[id]/route.ts
│       ├── tags/route.ts
│       └── bookmarks/route.ts
├── lib/
│   ├── db/index.ts              # @libsql/client 连接
│   ├── db/schema.ts             # Drizzle 表定义
│   ├── config.ts                # 应用配置（defaultProvider: custom）
│   ├── llm.ts                   # LLM 调用封装（fast/smart 双档位）
│   ├── search.ts                # Tavily Web Search
│   ├── scan-state.ts            # 扫描运行标志
│   ├── agents/                  # Scout/Analyst/Advisor/Orchestrator
│   └── skills/                  # repo-reader/summarizer/comparator
public/
├── manifest.json                # PWA manifest
├── sw.js                        # Service Worker
└── icons/                       # PWA 图标
```
