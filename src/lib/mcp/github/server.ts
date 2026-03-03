import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  searchRepos,
  getTrendingAIRepos,
  getRepoReadme,
  getRepoDetail,
  getRepoReleases,
} from './tools';

export function createGitHubMCPServer(): McpServer {
  const server = new McpServer({
    name: 'github-mcp',
    version: '1.0.0',
  });

  server.tool(
    'search_repos',
    'Search GitHub repositories by query',
    {
      query: z.string().describe('Search query string'),
      sort: z.enum(['stars', 'updated', 'forks']).default('stars').describe('Sort field'),
      per_page: z.number().min(1).max(50).default(20).describe('Results per page'),
    },
    async ({ query, sort, per_page }) => {
      const repos = await searchRepos(query, sort, per_page);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(repos.map(r => ({
              name: r.full_name,
              url: r.html_url,
              description: r.description,
              stars: r.stargazers_count,
              language: r.language,
              topics: r.topics,
            })), null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'get_trending',
    'Get trending AI repositories from the past week',
    {},
    async () => {
      const repos = await getTrendingAIRepos();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(repos.map(r => ({
              name: r.full_name,
              url: r.html_url,
              description: r.description,
              stars: r.stargazers_count,
              language: r.language,
              topics: r.topics,
            })), null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'get_readme',
    'Get the README content of a repository',
    {
      full_name: z.string().describe('Full repository name (owner/repo)'),
    },
    async ({ full_name }) => {
      const readme = await getRepoReadme(full_name);
      return {
        content: [{ type: 'text' as const, text: readme || 'No README found.' }],
      };
    },
  );

  server.tool(
    'get_repo_detail',
    'Get detailed information about a repository',
    {
      full_name: z.string().describe('Full repository name (owner/repo)'),
    },
    async ({ full_name }) => {
      const repo = await getRepoDetail(full_name);
      if (!repo) {
        return { content: [{ type: 'text' as const, text: 'Repository not found.' }] };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              name: repo.full_name,
              url: repo.html_url,
              description: repo.description,
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              language: repo.language,
              topics: repo.topics,
              created: repo.created_at,
              updated: repo.updated_at,
            }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'get_releases',
    'Get recent releases of a repository',
    {
      full_name: z.string().describe('Full repository name (owner/repo)'),
      per_page: z.number().min(1).max(20).default(5).describe('Number of releases'),
    },
    async ({ full_name, per_page }) => {
      const releases = await getRepoReleases(full_name, per_page);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(releases.map(r => ({
              tag: r.tag_name,
              name: r.name,
              body: r.body?.slice(0, 1000),
              date: r.published_at,
              url: r.html_url,
            })), null, 2),
          },
        ],
      };
    },
  );

  return server;
}
