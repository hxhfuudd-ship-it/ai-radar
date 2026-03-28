# AI Radar — Project Memory

## Identity
- Repo: `https://github.com/hxhfuudd-ship-it/ai-radar`
- Production: `https://myownproject-pi.vercel.app`
- Local: `~/Desktop/ai-radar`
- Deploy: `git push origin main` → Vercel auto deploy

## Stack
- Next.js 16 + React 19 + TypeScript (App Router, Turbopack)
- Tailwind CSS 4 + shadcn/ui
- Drizzle ORM + SQLite (`better-sqlite3` local / `@libsql/client` Turso in prod)
- OpenAI-compatible LLM (`DEFAULT_PROVIDER=custom`)
- GitHub REST API + Tavily web search

## Run
```bash
cd ~/Desktop/ai-radar
npm run dev
```

## Required Env (`.env.local`)
| Key | Purpose |
|-----|---------|
| `DEFAULT_PROVIDER` | `custom` |
| `CUSTOM_BASE_URL` | LLM base URL |
| `CUSTOM_API_KEY` | LLM key |
| `CUSTOM_MODEL_FAST` | Fast-tier model (e.g. `glm-4.7`) |
| `CUSTOM_MODEL_SMART` | Smart-tier model |
| `ADVISOR_MODEL` | Global chat (e.g. `kimi-k2.5`) |
| `ANALYST_MODEL` | Deep analysis (e.g. `deepseek-v3.2`) |
| `PROJECT_CHAT_MODEL` | Per-project chat (falls back to `CUSTOM_MODEL_FAST`) |
| `GITHUB_TOKEN` | GitHub API auth |
| `TAVILY_API_KEY` | Web search (optional) |
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | Prod DB (optional; falls back to `file:./data/ai-radar.db`) |

## Architecture

### Scan Pipeline
```
User clicks 扫描
  → Scout       搜索 GitHub (trending + topic search), 本地打分筛选
  → Orchestrator 刷新已有项目元数据 → 批量抓 README (8并发) → 调 Analyst (5并发)
  → Analyst     repo-reader skill (深度分析) + summarizer skill (摘要) → 打标签 + 评分 → SQLite
  → 前端 Feed 实时进度条更新
```

### Model Roles
| Agent | Model | Task |
|-------|-------|------|
| Scout | 无LLM | GitHub 搜索 + 本地打分 |
| Analyst | `deepseek-chat` | 深度分析 + 摘要 |
| Advisor | `deepseek-chat` | 全局对话顾问，可委派 Analyst |
| ProjectChat | `deepseek-chat` | 单项目问答 |

所有 LLM 调用统一走 DeepSeek API（`https://api.deepseek.com/v1`），单一模型 `deepseek-chat`。

## File Map
```
src/app/
  page.tsx                  首页 Feed（hot/recommended 双模式，搜索+标签筛选+分页）
  project/[id]/page.tsx     项目详情（摘要 + Markdown分析 + 收藏 + ProjectChat）
  bookmarks/page.tsx        收藏列表
  chat/page.tsx             全局 Advisor 对话
  api/scan/route.ts         POST触发扫描 / GET轮询进度（NDJSON stream）
  api/projects/route.ts     GET列表（tag/search/mode过滤，分页参数limit/offset，返回真实total）
  api/projects/[id]/route.ts GET详情（innerJoin一次性查tags）
  api/tags/route.ts         GET标签（mode-aware，hot模式改为join/groupBy一次查询）
  api/bookmarks/route.ts    GET/POST/PATCH 收藏管理
  api/chat/route.ts         POST Advisor / ProjectChat SSE流式对话，透出真实错误信息

src/components/
  ProjectCard.tsx           React.memo卡片，显示stars/forks/tags/score
  ScanButton.tsx            扫描按钮 + ScanProvider + ScanProgress
  ChatPanel.tsx             全局聊天面板（SSE）
  ProjectChat.tsx           项目内聊天（SSE）
  MarkdownContent.tsx       react-markdown渲染（next/dynamic懒加载）
  Navbar.tsx                顶部导航
  ServiceWorkerRegister.tsx 开发环境自动注销SW并清理缓存，生产环境正常注册

src/lib/
  config.ts                 APP_CONFIG（扫描参数）+ LLM provider配置
  llm.ts                    chat() / chatStream() 统一封装，支持多provider
  scan-state.ts             内存扫描状态（轮询用）
  search.ts                 Tavily web搜索 + 搜索触发判断
  db/schema.ts              5张表：projects/tags/project_tags/bookmarks/chat_history
  db/index.ts               DB连接（Turso优先，本地fallback）
  agents/scout.ts           GitHub候选搜索+本地打分
  agents/analyst.ts         analyzeProject() + computeProjectScore()
  agents/orchestrator.ts    runFullScan() + refreshTrackedProjects() + cleanupOldProjects()
  agents/advisor.ts         chatWithAdvisor() + chatAboutProject()
  mcp/github/tools.ts       getTrendingAIRepos / searchRepos / getRepoDetail / getRepoReadme
  skills/repo-reader.ts     深度分析prompt（500-800字中文报告）
  skills/summarizer.ts      摘要prompt（100-200字）
  skills/comparator.ts      对比prompt（暂未在advisor中调用）

src/hooks/
  useChatStream.ts          统一SSE聊天流 hook，支持 projectContext、超时和错误回显
```

## Database Schema
| Table | Key Fields |
|-------|------------|
| `projects` | id, fullName, stars, forks, summary, analysis, score, repoCreatedAt, discoveredAt, analyzedAt |
| `tags` | id, name (unique) |
| `project_tags` | projectId, tagId |
| `bookmarks` | id, projectId, note, createdAt |
| `chat_history` | id, role, content, createdAt |

## Key Config (APP_CONFIG)
| Param | Value | Meaning |
|-------|-------|---------|
| `hotProjectWindowDays` | 90 | hot模式：90天内创建的项目 |
| `recommendedProjectActiveWindowDays` | 180 | 推荐池：180天内有push的项目 |
| `recommendedProjectMinStars` | 300 | 推荐池最低stars门槛 |
| `maxHotProjectsPerScan` | 15 | 每次扫描最多15个hot项目 |
| `maxRecommendedProjectsPerScan` | 12 | 每次扫描最多12个推荐项目 |
| `analysisConcurrency` | 5 | Analyst并发数 |
| `skipIfAnalyzedWithinDays` | 1 | 1天内已分析则跳过（force扫描可覆盖）|
| `projectRetentionDays` | 365 | 超过365天的项目自动清理（收藏项目保留）|

## Resolved Issues (2026-03-22)
- 首页分页、筛选请求、API 分页参数、tags 查询优化 — 均已修复
- 构建不再依赖 `next/font/google`，离线可 build
- 聊天链路增强：30 秒超时、API Key 失效提示、服务端错误透传
- `.next` 旧编译产物 + Tailwind v4 扫描冲突问题已解决（`.gitignore` 已加 `/.next-stale-*/`）
- Service Worker 开发环境自动注销，避免缓存旧资源

## Current Status (2026-03-26)
- 本地 AI 对话功能已测试正常（Advisor 全局对话 + ProjectChat 项目问答均可用）
- 本地扫描、项目列表、详情、收藏等功能正常
- `comparatorSkill` 已定义但尚未接入 Advisor，对比能力走 Analyst 直接分析

## Production Status
- 部署在 Vercel：`myownproject-pi.vercel.app`
- 浏览项目、详情、收藏等非 LLM 功能正常
- LLM 相关功能（AI 对话、扫描分析）需要 Vercel 后台环境变量正确配置，之前曾报 `401 API key doesn't exist`
- 待办：在 Vercel Dashboard 更新 `CUSTOM_API_KEY` 等环境变量以恢复线上 AI 功能
- 待办（未落地）：给项目问答加 API Key 失效时的本地兜底回答
