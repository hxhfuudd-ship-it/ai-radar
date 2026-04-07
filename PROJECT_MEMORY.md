# AI Radar — Project Memory

## Identity
- Repo: `https://github.com/hxhfuudd-ship-it/ai-radar`
- Production: `https://myownproject-pi.vercel.app`
- Local: `~/Desktop/ai-radar`
- Deploy: `npx vercel --prod --yes`（Vercel 未关联 GitHub，需手动部署）

## Stack
- Next.js 16 + React 19 + TypeScript (App Router)
- Tailwind CSS 4 + shadcn/ui
- Drizzle ORM + @libsql/client（本地 SQLite 回退 / Turso 云数据库）
- DeepSeek API（OpenAI 兼容格式，`DEFAULT_PROVIDER=custom`）
- GitHub REST API + Tavily web search
- streamdown + @streamdown/cjk（流式 Markdown 渲染）
- PWA (Service Worker + Web App Manifest)

## Run
```bash
cd ~/Desktop/ai-radar
npm run dev
```

## Required Env (`.env.local`)
| Key | Purpose |
|-----|---------|
| `DEFAULT_PROVIDER` | `custom` |
| `CUSTOM_BASE_URL` | DeepSeek API URL (`https://api.deepseek.com/v1`) |
| `CUSTOM_API_KEY` | DeepSeek API key |
| `CUSTOM_MODEL_FAST` | Fast-tier model (`deepseek-chat`) |
| `CUSTOM_MODEL_SMART` | Smart-tier model (`deepseek-chat`) |
| `ADVISOR_MODEL` | Global chat (`deepseek-chat`) |
| `ANALYST_MODEL` | Deep analysis (`deepseek-chat`) |
| `PROJECT_CHAT_MODEL` | Per-project chat (`deepseek-chat`, falls back to `CUSTOM_MODEL_FAST`) |
| `GITHUB_TOKEN` | GitHub API auth |
| `TAVILY_API_KEY` | Web search (optional) |
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | Prod DB (optional; falls back to `file:./data/ai-radar.db`) |

## Architecture

### Scan Pipeline
```
User clicks 扫描
  → cleanupOldProjects (365天 + 去重，收藏跳过)
  → refreshTrackedProjects (8并发刷新已有项目 GitHub 元数据，stars 变化时快照到 previousStars/previousStarsAt)
  → Scout       搜索 GitHub (trending + topic search), 本地打分筛选 (hot + recommended 双池)
  → Orchestrator 批量抓 README (8并发) → 调 Analyst (5并发)
  → Analyst     repo-reader skill (深度分析) + summarizer skill (摘要) → 打标签 + 评分 → DB
  → 前端 NDJSON 流式进度条更新
```

### Model Roles (当前统一 deepseek-chat)
| 模块 | Model | Task |
|-------|-------|------|
| Scout | 无LLM | GitHub 搜索 + 本地打分 |
| Analyst | `deepseek-chat` (`ANALYST_MODEL`) | 深度分析 + 摘要 |
| Advisor | `deepseek-chat` (`ADVISOR_MODEL`) | 全局对话顾问，可委派 Analyst |
| ProjectChat | `deepseek-chat` (`PROJECT_CHAT_MODEL`) | 单项目问答 |

所有 LLM 调用统一走 DeepSeek API（`https://api.deepseek.com/v1`），当前统一使用 `deepseek-chat` 模型。

## File Map
```
src/app/
  page.tsx                  首页 Feed（hot/recommended 双模式，搜索+标签筛选+分页）
  project/[id]/page.tsx     项目详情（Server Component：摘要 + 分析 + 收藏 + ProjectChat）
  project/[id]/client.tsx   详情页客户端组件（BookmarkButton + AnalysisContent + ProjectChatWrapper）
  bookmarks/page.tsx        收藏列表
  chat/page.tsx             全局 Advisor 对话
  api/scan/route.ts         POST触发扫描（NDJSON stream）/ GET状态（模块级 scanRunning）
  api/projects/route.ts     GET列表（tag/search/mode过滤，分页 limit/offset）
  api/projects/[id]/route.ts GET详情（join查tags + 收藏状态）
  api/tags/route.ts         GET标签（mode-aware，hot模式join/groupBy）
  api/bookmarks/route.ts    GET/POST/PATCH 收藏管理
  api/chat/route.ts         POST Advisor / ProjectChat SSE流式对话

src/components/
  BrandLogo.tsx             品牌 Logo（Next Image + SVG）
  ProjectCard.tsx           React.memo卡片，标题17字截断，stars/forks紧凑格式(formatStars)，NEW徽章+TRENDING箭头，推荐指数1-5星
  ScanButton.tsx            扫描按钮 + ScanProvider + ScanProgress（Context 三组件）
  ChatPanel.tsx             全局聊天面板（SSE + useChatStream）
  ProjectChat.tsx           项目内聊天（SSE + useChatStream）
  MarkdownContent.tsx       streamdown + @streamdown/cjk（流式渲染 + caret 光标）
  Navbar.tsx                顶部导航（Lucide 图标 + 移动端汉堡菜单 + safe-area）
  ServiceWorkerRegister.tsx 开发环境自动注销SW并清理缓存，生产环境正常注册

src/hooks/
  useChatStream.ts          统一SSE聊天流 hook（RAF 批量更新 + SSE 行缓冲 + 超时/错误处理）

src/lib/
  config.ts                 APP_CONFIG（扫描参数）+ LLM provider配置
  llm.ts                    chat() / chatStream() 统一封装，支持多provider + 客户端缓存
  scan-state.ts             扫描状态（被 scout.ts 使用更新进度文案）
  search.ts                 Tavily web搜索 + 搜索触发判断
  db/schema.ts              5张表：projects/tags/project_tags/bookmarks/chat_history
  db/index.ts               @libsql/client 连接（Turso优先，本地fallback，异步）
  agents/scout.ts           GitHub候选搜索+本地打分（scoreHotRepo + scoreRecommendedRepo）
  agents/analyst.ts         analyzeProject() + computeProjectScore()
  agents/orchestrator.ts    runFullScan() + refreshTrackedProjects() + cleanupOldProjects()
  agents/advisor.ts         chatWithAdvisor() + chatAboutProject()
  mcp/github/tools.ts       getTrendingAIRepos / searchRepos / getRepoDetail / getRepoReadme
  skills/repo-reader.ts     深度分析prompt（500-800字中文报告）
  skills/summarizer.ts      摘要prompt（100-200字）
  skills/comparator.ts      对比prompt（已注册，暂未在advisor中调用）
```

## Database Schema
| Table | Key Fields |
|-------|------------|
| `projects` | id, fullName, stars, forks, summary, analysis, score, repoCreatedAt, previousStars, previousStarsAt, discoveredAt, analyzedAt |
| `tags` | id, name (unique) |
| `project_tags` | projectId, tagId |
| `bookmarks` | id, projectId, note, createdAt |
| `chat_history` | id, role, content, createdAt（已定义，暂未使用） |

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

## Velocity Calculation (热榜增速)
- 热榜排序用 `computeVelocity`（`src/app/api/projects/route.ts`）
- 优先用真实 delta：`(stars - previousStars) / 间隔天数`，**要求快照间隔 ≥ 12 小时**
- 快照不满 12h 或无历史快照时退回估算：`stars / 创建天数`
- 每次扫描刷新元数据时，stars 有变化且距上次快照 ≥ 12h 才更新 `previousStars`/`previousStarsAt`（`shouldSnapshotStars` 守卫，防止同一次扫描内多次覆盖）
- 前端 TRENDING 标记（ProjectCard）也用同样逻辑，增速 > 30 stars/天显示趋势箭头

## Recommended Mode (AI 推荐)
- 搜索：6 topics × `stars>300 pushed>180天前`，按 stars 排序，每个取 10 个
- Scout 打分：`scoreRecommendedRepo` = `scoreHotRepo` 基础分 + stars/forks/活跃度额外加权，门槛 ≥ 5，取 Top 12
- 推荐指数：`computeProjectScore`（analyst.ts）6 维度评分，`Math.round(总分/2.5)` → 1-5 星
  - 维度：stars 热度(+6)、forks(+2)、信息完整度(+2)、AI 报告质量(+2)、维护活跃度(+1.5/-0.5)、成熟度(+0.5)
  - AI 报告长度也是评分因子——文档丰富的项目得分更高
- API 排序：`ORDER BY score DESC, stars DESC, repo_updated_at DESC`，无时间窗口

## Notes
- `comparatorSkill` 已定义并注册但尚未接入 Advisor，对比能力目前走 Analyst 直接分析
- `chat_history` 表已定义但暂未使用，对话历史保存在前端 React 状态中
- Vercel 环境变量用 `printf 'value' | npx vercel env add NAME production` 设置（不要用 `<<<`，会加换行符）
