import { tavily } from '@tavily/core';

const apiKey = process.env.TAVILY_API_KEY;

/**
 * Tavily web search. Returns formatted text context for LLM consumption.
 * Gracefully returns empty string when API key is not configured.
 */
export async function webSearch(query: string, maxResults = 3): Promise<string> {
  if (!apiKey) return '';

  try {
    const client = tavily({ apiKey });
    const response = await client.search(query, {
      maxResults,
      searchDepth: 'basic',
      includeAnswer: true,
    });

    const parts: string[] = [];

    if (response.answer) {
      parts.push(`搜索摘要：${response.answer}`);
    }

    if (response.results?.length) {
      parts.push('相关来源：');
      for (const r of response.results) {
        parts.push(`- ${r.title}\n  ${r.url}\n  ${r.content?.slice(0, 300) ?? ''}`);
      }
    }

    return parts.join('\n\n');
  } catch (err) {
    console.error('Web search failed:', err);
    return '';
  }
}

const COMPARE_RE = /对比|比较|VS|vs|区别|替代|类似|竞品|不同|优劣/;
const QUERY_RE = /(.+?)(?:是什么|怎么样|有什么用|好不好|值得|怎么用)/;

/**
 * Detect whether the user's question needs web search and build the search query.
 * Returns null if no search is needed.
 */
export function detectWebSearchNeed(
  userInput: string,
  dbResultNames: string[],
): string | null {
  const namesLower = new Set(dbResultNames.map(n => n.toLowerCase()));

  if (COMPARE_RE.test(userInput)) {
    return `${userInput} AI 开源项目`;
  }

  const queryMatch = userInput.match(QUERY_RE);
  if (queryMatch) {
    const subject = queryMatch[1].trim();
    if (!namesLower.has(subject.toLowerCase())) {
      return `${subject} AI 开源项目`;
    }
  }

  if (dbResultNames.length === 0) {
    return `${userInput} AI 开源项目 GitHub`;
  }

  return null;
}

/**
 * Detect if project chat needs web search (user comparing with external projects).
 * Returns a search query or null.
 */
export function detectProjectChatSearch(
  userInput: string,
  currentProjectName: string,
): string | null {
  if (COMPARE_RE.test(userInput)) {
    return `${userInput} ${currentProjectName} AI 对比`;
  }

  if (/替代方案|alternative|类似.*(项目|工具|框架)/.test(userInput)) {
    return `${currentProjectName} alternatives AI`;
  }

  return null;
}
