# AI Radar — Project Memory

单一项目记忆文件。保留这个，其他 memory 文档删除。

## Identity
- Repo: `https://github.com/hxhfuudd-ship-it/ai-radar`
- Production: `https://myownproject-pi.vercel.app`
- Local path: `~/Desktop/ai-radar`
- Deploy path: `git push origin main` -> Vercel auto deploy

## Stack
- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui
- `@libsql/client` + Drizzle ORM
- OpenAI-compatible LLM endpoint (`DEFAULT_PROVIDER=custom`)
- GitHub API + Tavily web search

## Run
```bash
cd ~/Desktop/ai-radar
npm run dev
```

## Required Env
- `CUSTOM_BASE_URL`
- `CUSTOM_API_KEY`
- `DEFAULT_PROVIDER=custom`
- `CUSTOM_MODEL_FAST`
- `CUSTOM_MODEL_SMART`
- `ADVISOR_MODEL`
- `ANALYST_MODEL`
- `PROJECT_CHAT_MODEL`
- `GITHUB_TOKEN`
- `TAVILY_API_KEY` (optional)
- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (optional; otherwise local DB fallback)

## Current Product Truth
- Homepage default is `近 90 天最火`, not recommendation-first.
- Hot ranking filters to projects created within the last `90` days.
- Hot ranking sorts by `stars DESC`, then `forks DESC`, then `repoUpdatedAt DESC`.
- `AI 推荐` tab still exists and sorts by `score DESC`, then `stars DESC`.
- Every scan now refreshes tracked project metadata before scanning new candidates.
- Project cleanup retention is `120` days, so the 90-day hot list is not deleted too early.
- Re-analysis skip window remains `1` day unless force scan.

## Core Flow
1. `Scout` searches GitHub candidates and ranks them locally.
2. `Orchestrator` refreshes existing tracked projects, fetches READMEs, and batches analysis.
3. `Analyst` generates summary, analysis, tags, and score.
4. Results are stored in libsql/SQLite and shown in homepage, detail page, bookmarks, and chat.

## Important Files
- `src/app/page.tsx`: homepage, hot/recommended tab switching
- `src/app/api/projects/route.ts`: list filtering and ranking
- `src/app/api/tags/route.ts`: mode-aware tag list
- `src/lib/agents/scout.ts`: GitHub candidate search window and ranking
- `src/lib/agents/orchestrator.ts`: scan pipeline, tracked-project refresh, cleanup
- `src/lib/agents/advisor.ts`: global chat and project chat
- `src/lib/config.ts`: ranking/retention/scanning constants

## Operational Notes
- Local DB fallback is `file:./data/ai-radar.db`.
- Scan API is NDJSON streaming; chat API is SSE streaming.
- Do not rely on in-memory scan state across Vercel requests.
- When adding Vercel envs, prefer `printf 'value' | npx vercel env add NAME production`; do not use `<<<`.
