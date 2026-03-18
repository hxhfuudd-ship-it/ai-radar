const GITHUB_API = 'https://api.github.com';

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ai-radar',
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  created_at: string;
  updated_at: string;
}

export async function searchRepos(query: string, sort = 'stars', perPage = 20): Promise<GitHubRepo[]> {
  const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&per_page=${perPage}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.items ?? [];
}

export async function getTrendingAIRepos(windowDays = 90): Promise<GitHubRepo[]> {
  const dateStr = getRecentDate(windowDays);
  const queries = [
    `topic:llm stars:>10 created:>${dateStr}`,
    `topic:agent stars:>10 created:>${dateStr}`,
    `topic:ai-agent stars:>10 created:>${dateStr}`,
    `topic:mcp stars:>5 created:>${dateStr}`,
    `topic:rag stars:>10 created:>${dateStr}`,
  ];

  const allResults = await Promise.allSettled(
    queries.map(q => searchRepos(q, 'stars', 10))
  );

  const results: GitHubRepo[] = [];
  const seen = new Set<number>();

  for (const result of allResults) {
    if (result.status === 'fulfilled') {
      for (const repo of result.value) {
        if (!seen.has(repo.id)) {
          seen.add(repo.id);
          results.push(repo);
        }
      }
    }
  }

  return results.sort((a, b) => b.stargazers_count - a.stargazers_count);
}

function getRecentDate(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().split('T')[0];
}

export async function getRepoReadme(fullName: string): Promise<string> {
  const url = `${GITHUB_API}/repos/${fullName}/readme`;
  const res = await fetch(url, {
    headers: { ...headers(), Accept: 'application/vnd.github.v3.raw' },
  });
  if (!res.ok) return '';
  const text = await res.text();
  return text.slice(0, 4000);
}

export async function getRepoDetail(fullName: string): Promise<GitHubRepo | null> {
  const url = `${GITHUB_API}/repos/${fullName}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return null;
  return res.json();
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

export async function getRepoReleases(fullName: string, perPage = 5): Promise<GitHubRelease[]> {
  const url = `${GITHUB_API}/repos/${fullName}/releases?per_page=${perPage}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}
