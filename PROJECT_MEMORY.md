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
| Analyst | `ANALYST_MODEL` (deepseek-v3.2) | 深度分析 + 摘要 |
| Advisor | `ADVISOR_MODEL` (kimi-k2.5) | 全局对话顾问，可委派 Analyst |
| ProjectChat | `PROJECT_CHAT_MODEL` | 单项目问答 |

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

## Latest Session (2026-03-22)
- 首页已补分页：`src/app/page.tsx` 新增 `PAGE_SIZE=12`、页码切换、总数展示，并在搜索/标签/模式变化时自动回到第1页。
- 修复首页筛选请求 bug：原先 `selectedTag !== undefined` 实际几乎恒为真，导致搜索防抖/即时请求逻辑异常；现已按 `modeChanged || tagChanged` 正确分流。
- `src/app/api/projects/route.ts` 已加固分页参数，`limit/offset` 会做边界和整数化处理；tag 过滤改成 `projects + project_tags + tags` join，`total` 使用 `countDistinct(projects.id)`，避免先查 tag 再拼 projectIds 的低效方案。
- `src/app/api/tags/route.ts` 的 hot 模式已从多次串行查询改为一次 join/groupBy 查询，只返回近 90 天项目实际使用到的标签。
- 构建稳定性已修复：`src/app/layout.tsx` / `src/app/globals.css` 不再依赖 `next/font/google`，避免离线或受限网络下 dev/build 卡住。
- 项目详情分析报告显示已优化：`src/app/project/[id]/client.tsx` 会把 `【标题】` 转成 Markdown 标题，阅读性更好。
- 聊天链路已增强：
  - `src/hooks/useChatStream.ts` 增加 30 秒超时、API Key 失效提示、服务端错误透传。
  - `src/app/api/chat/route.ts` 会把真实异常写日志并通过 SSE 返回，不再统一吞成模糊报错。
- 这次“AI 问答不好使”的根因已确认不是后端或模型，而是本地 `.next/dev` 里混入了旧编译产物，甚至仍引用 `/Users/wanghao/Desktop/my_own_project` 和旧前端报错文案 `抱歉，出现了错误。请稍后重试。`，导致浏览器实际跑的是陈旧 bundle。
- 额外排障结论：Tailwind CSS v4 会自动扫描项目根目录中的文本文件；如果把旧编译目录以 `.next-stale-*` 的形式留在仓库内，里面残留的旧 HTML/JS/CSS 类名也会被再次扫描，重新生成损坏规则，导致 `globals.css` 在 dev 阶段继续报 `Parsing CSS source code failed`。
- 已采取的修复动作：
  - 杀掉旧 `next dev` 进程。
  - 将旧 `.next` 挪到 `.next-stale-20260322-chat-fix/` 备份。
  - 重新启动当前仓库的 `npm run dev`，当前应从 `http://localhost:3000` 访问。
  - `public/sw.js` 和 `src/components/ServiceWorkerRegister.tsx` 已处理开发环境下的 Service Worker 注销和缓存清理，避免再次缓存旧资源。
  - 后续已把 `.next-stale-20260322-chat-fix/`、`.next-stale-20260322-css-fix/` 移出仓库到 `/tmp/ai-radar-stale-builds/`，并在 `.gitignore` 增加 `/.next-stale-*/`，避免再次被 Tailwind 扫描。
- 已验证结果：
  - `npm run lint` 通过。
  - `npm run build` 通过。
  - 本地 `curl http://127.0.0.1:3000/api/chat` 已验证可正常流式返回项目问答。
  - 截图里同一问题“适合什么场景使用？”对 `googleworkspace/cli` 已能正确回答。

## Current Follow-up
- 浏览器侧若还看到旧问答报错，优先关闭旧标签页，重新打开 `http://localhost:3000`，或至少强刷，确保不再使用旧内存中的 JS bundle。
- `.next-stale-20260322-chat-fix/` 是这次排障保留的旧编译目录；确认一切稳定后可以删除。
- `comparatorSkill` 仍已定义但尚未接入 Advisor，对比能力目前仍走 Analyst 直接分析。

## Production Follow-up (2026-03-22)
- 已把线上相关修复提交并推送到 GitHub `main`，用于触发 Vercel 自动部署。部署提交为 `b201c0b`：`fix: stabilize production chat and feed experience`。
- 推送前已验证：
  - `npm run lint` 通过
  - `npm run build` 通过
- 线上问题进一步定位后，确认生产站项目问答失败的根因不是前端缓存，也不是当前代码逻辑，而是 Vercel 生产环境调用上游模型时返回了 `401 The API key doesn't exist`。
- 结合代码路径可确认，项目问答走的是 `custom` provider：
  - `src/lib/agents/advisor.ts`
  - `src/lib/config.ts`
  - `src/lib/llm.ts`
- 因此生产环境最关键的变量是：
  - `DEFAULT_PROVIDER`
  - `CUSTOM_BASE_URL`
  - `CUSTOM_API_KEY`
  - `CUSTOM_MODEL_FAST`
  - `CUSTOM_MODEL_SMART`
  - `PROJECT_CHAT_MODEL`
  - `ADVISOR_MODEL`
  - `ANALYST_MODEL`
- 本地 `localhost:3000` 能正常回答，说明 `.env.local` 的这套值是可用的；生产站报 401，说明 Vercel 上至少 `CUSTOM_API_KEY` 已失效、填错，或和 `CUSTOM_BASE_URL` / 模型配置不匹配。
- 本轮未直接修复 Vercel env：当前机器没有可用的 Vercel 登录凭据，无法直接改线上环境变量；走的是 `git push origin main` 触发自动部署这条链路。
- 远程连通性补充：
  - `myownproject-pi.vercel.app` 域名解析正常
  - 但当前执行环境对该域名的 HTTP 探测超时，无法在本机稳定完成最终线上回包校验
- 本轮还做过一半的想法但未落地：准备给 `projectContext` 问答加“上游 API Key 失效时的本地摘要/分析兜底回答”，这样即使生产 key 有问题，项目页也不至于直接报错；用户中途打断，尚未实现。
- 注意：当前仓库头部已不是 `b201c0b`，而是后续的 `dfe3497`（提交信息为 `1`）。这次生产排障结论仍然成立，但如果后续继续改线上问题，需要先看 `dfe3497` 是否又改动了部署相关内容。
