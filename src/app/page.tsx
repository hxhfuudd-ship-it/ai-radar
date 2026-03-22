'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, X, WifiOff } from 'lucide-react';
import { ProjectCard } from '@/components/ProjectCard';
import { ScanProvider, ScanButton, ScanProgress } from '@/components/ScanButton';
import { BrandLogo } from '@/components/BrandLogo';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Project } from '@/lib/db/schema';

type ProjectSortMode = 'hot' | 'recommended';

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<ProjectSortMode>('hot');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const initialLoadRef = useRef(true);
  const previousModeRef = useRef<ProjectSortMode>('hot');
  const activeRequestIdRef = useRef(0);
  const projectsAbortRef = useRef<AbortController | null>(null);
  const tagsAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  // track latest search for debounced batch
  const pendingSearchRef = useRef('');

  const fetchTags = useCallback(async (mode: ProjectSortMode, requestId: number) => {
    tagsAbortRef.current?.abort();
    const controller = new AbortController();
    tagsAbortRef.current = controller;
    try {
      const res = await fetch(`/api/tags?mode=${mode}`, { signal: controller.signal });
      if (!res.ok) throw new Error('tags failed');
      const data = await res.json();
      if (requestId !== activeRequestIdRef.current) return;
      const nextTags = (data.tags ?? []).map((t: { name: string }) => t.name);
      setTags(nextTags);
      setSelectedTag(current => (current && !nextTags.includes(current) ? null : current));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      throw err;
    }
  }, []);

  const fetchProjects = useCallback(async (tag: string | null, q: string, mode: ProjectSortMode, requestId: number) => {
    projectsAbortRef.current?.abort();
    const controller = new AbortController();
    projectsAbortRef.current = controller;
    try {
      const params = new URLSearchParams();
      if (tag) params.set('tag', tag);
      if (q) params.set('search', q);
      params.set('mode', mode);
      const res = await fetch(`/api/projects?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('projects failed');
      const data = await res.json();
      if (requestId !== activeRequestIdRef.current) return;
      setProjects(data.projects ?? []);
      setError(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (requestId === activeRequestIdRef.current) {
        setError(true);
        setProjects([]);
      }
    }
  }, []);

  const runRequestBatch = useCallback(async ({
    tag,
    q,
    mode,
    includeTags,
  }: {
    tag: string | null;
    q: string;
    mode: ProjectSortMode;
    includeTags: boolean;
  }) => {
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    setLoading(true);
    setError(false);

    if (!includeTags) {
      tagsAbortRef.current?.abort();
      tagsAbortRef.current = null;
    }

    const tasks: Promise<unknown>[] = [fetchProjects(tag, q, mode, requestId)];
    if (includeTags) tasks.push(fetchTags(mode, requestId));

    try {
      await Promise.all(tasks);
    } catch {
      // individual fetch fns handle their own errors
    } finally {
      if (requestId === activeRequestIdRef.current) setLoading(false);
    }
  }, [fetchProjects, fetchTags]);

  // Initial load
  useEffect(() => {
    void runRequestBatch({ tag: null, q: '', mode: 'hot', includeTags: true });
  }, [runRequestBatch]);

  // Debounced re-fetch on filter changes (skip first render)
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }

    const includeTags = sortMode !== previousModeRef.current;
    if (includeTags) previousModeRef.current = sortMode;

    // For tag/mode changes fire immediately; for search debounce 300ms
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    pendingSearchRef.current = search;

    const fire = () => {
      void runRequestBatch({
        tag: selectedTag,
        q: pendingSearchRef.current,
        mode: sortMode,
        includeTags,
      });
    };

    if (includeTags || selectedTag !== undefined) {
      // mode or tag changed — fire now, cancel any pending search debounce
      fire();
    } else {
      // only search changed — debounce
      searchDebounceRef.current = setTimeout(fire, 300);
    }

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [selectedTag, search, sortMode, runRequestBatch]);

  const handleScanComplete = useCallback(() => {
    void runRequestBatch({
      tag: selectedTag,
      q: search,
      mode: sortMode,
      includeTags: true,
    });
  }, [selectedTag, search, sortMode, runRequestBatch]);

  useEffect(() => {
    return () => {
      projectsAbortRef.current?.abort();
      tagsAbortRef.current?.abort();
    };
  }, []);

  return (
    <ScanProvider onComplete={handleScanComplete}>
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Radar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sortMode === 'hot'
              ? '近 90 天创建的 AI 项目，按热度排序'
              : '跨周期 AI 精选，兼顾长期价值、维护活跃度和技术质量'}
          </p>
        </div>
        <ScanButton />
      </div>

      <ScanProgress />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={sortMode} onValueChange={value => setSortMode(value as ProjectSortMode)}>
          <TabsList>
            <TabsTrigger value="hot">近 90 天最火</TabsTrigger>
            <TabsTrigger value="recommended">AI 推荐</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          {sortMode === 'hot'
            ? '按 Stars、Forks、最近更新时间排序'
            : '按 AI 推荐分、Stars、最近更新时间排序'}
        </p>
      </div>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索项目名称、描述、标签..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-10"
          />
          {search ? (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground active:bg-accent"
              aria-label="清除搜索"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          <Badge
            variant={selectedTag === null ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedTag(null)}
          >
            全部
          </Badge>
          {tags.slice(0, 15).map(tag => (
            <Badge
              key={tag}
              variant={selectedTag === tag ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <WifiOff className="h-8 w-8" />
          </div>
          <p className="text-lg font-medium">加载失败</p>
          <p className="mt-2 text-sm">网络异常，请检查连接后重试</p>
          <button
            onClick={() => runRequestBatch({ tag: selectedTag, q: search, mode: sortMode, includeTags: true })}
            className="mt-4 rounded-md border px-4 py-2 text-sm transition-colors hover:bg-accent active:bg-accent"
          >
            重新加载
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <BrandLogo size={32} className="h-8 w-8" decorative />
          </div>
          <p className="text-lg font-medium">{search || selectedTag ? '没有匹配的项目' : '还没有项目数据'}</p>
          <p className="mt-2 text-sm">
            {search || selectedTag ? '换个关键词或标签试试' : '点击上方「扫描最新项目」按钮开始发现 AI 项目'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </main>
    </ScanProvider>
  );
}
