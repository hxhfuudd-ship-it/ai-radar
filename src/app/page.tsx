'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal, Search, X, WifiOff } from 'lucide-react';
import { ProjectCard } from '@/components/ProjectCard';
import { ScanProvider, ScanButton, ScanProgress } from '@/components/ScanButton';
import { BrandLogo } from '@/components/BrandLogo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Project } from '@/lib/db/schema';

type ProjectSortMode = 'hot' | 'recommended';
type HotWindow = 7 | 30 | 90;
type PaginationItem = number | 'ellipsis';

const PAGE_SIZE = 12;
const HOT_WINDOWS: { value: HotWindow; label: string }[] = [
  { value: 7, label: '本周' },
  { value: 30, label: '本月' },
  { value: 90, label: '近3月' },
];

function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: PaginationItem[] = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);

  if (windowStart > 2) {
    items.push('ellipsis');
  }

  for (let page = windowStart; page <= windowEnd; page += 1) {
    items.push(page);
  }

  if (windowEnd < totalPages - 1) {
    items.push('ellipsis');
  }

  items.push(totalPages);
  return items;
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<ProjectSortMode>('hot');
  const [hotWindow, setHotWindow] = useState<HotWindow>(30);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const initialLoadRef = useRef(true);
  const initialPageLoadRef = useRef(true);
  const previousModeRef = useRef<ProjectSortMode>('hot');
  const previousWindowRef = useRef<HotWindow>(30);
  const previousTagRef = useRef<string | null>(null);
  const previousSearchRef = useRef('');
  const activeRequestIdRef = useRef(0);
  const projectsAbortRef = useRef<AbortController | null>(null);
  const tagsAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  // track latest search for debounced batch
  const pendingSearchRef = useRef('');
  const pendingPageResetRef = useRef<{
    includeTags: boolean;
    debounce: boolean;
  } | null>(null);
  const requestContextRef = useRef<{
    tag: string | null;
    q: string;
    mode: ProjectSortMode;
    window: HotWindow;
  }>({
    tag: null,
    q: '',
    mode: 'hot',
    window: 30,
  });

  requestContextRef.current = {
    tag: selectedTag,
    q: search,
    mode: sortMode,
    window: hotWindow,
  };

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

  const fetchProjects = useCallback(async (
    tag: string | null,
    q: string,
    mode: ProjectSortMode,
    page: number,
    requestId: number,
    window?: HotWindow,
  ) => {
    projectsAbortRef.current?.abort();
    const controller = new AbortController();
    projectsAbortRef.current = controller;
    try {
      const params = new URLSearchParams();
      if (tag) params.set('tag', tag);
      if (q) params.set('search', q);
      params.set('mode', mode);
      if (mode === 'hot' && window) params.set('window', String(window));
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String((page - 1) * PAGE_SIZE));
      const res = await fetch(`/api/projects?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('projects failed');
      const data = await res.json();
      if (requestId !== activeRequestIdRef.current) return;
      const nextTotal = Number(data.total ?? 0);
      setTotal(Number.isFinite(nextTotal) ? nextTotal : 0);

      const maxPage = Math.max(1, Math.ceil((Number.isFinite(nextTotal) ? nextTotal : 0) / PAGE_SIZE));
      if (page > maxPage) {
        setCurrentPage(maxPage);
        return;
      }

      setProjects(data.projects ?? []);
      setError(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (requestId === activeRequestIdRef.current) {
        setError(true);
        setProjects([]);
        setTotal(0);
      }
    }
  }, []);

  const runRequestBatch = useCallback(async ({
    tag,
    q,
    mode,
    page,
    includeTags,
    window: win,
  }: {
    tag: string | null;
    q: string;
    mode: ProjectSortMode;
    page: number;
    includeTags: boolean;
    window?: HotWindow;
  }) => {
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    setLoading(true);
    setError(false);

    if (!includeTags) {
      tagsAbortRef.current?.abort();
      tagsAbortRef.current = null;
    }

    const tasks: Promise<unknown>[] = [fetchProjects(tag, q, mode, page, requestId, win)];
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
    void runRequestBatch({ tag: null, q: '', mode: 'hot', page: 1, includeTags: true, window: 30 });
  }, [runRequestBatch]);

  // Debounced re-fetch on filter changes (skip first render)
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }

    const modeChanged = sortMode !== previousModeRef.current;
    const windowChanged = hotWindow !== previousWindowRef.current;
    const tagChanged = selectedTag !== previousTagRef.current;
    const searchChanged = search !== previousSearchRef.current;
    const includeTags = modeChanged;

    if (modeChanged) previousModeRef.current = sortMode;
    if (windowChanged) previousWindowRef.current = hotWindow;
    if (tagChanged) previousTagRef.current = selectedTag;
    if (searchChanged) previousSearchRef.current = search;

    if (!modeChanged && !windowChanged && !tagChanged && !searchChanged) {
      return;
    }

    if (currentPage !== 1) {
      pendingPageResetRef.current = {
        includeTags,
        debounce: !modeChanged && !windowChanged && !tagChanged,
      };
      setCurrentPage(1);
      return;
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    pendingSearchRef.current = search;

    const fire = () => {
      void runRequestBatch({
        tag: selectedTag,
        q: pendingSearchRef.current,
        mode: sortMode,
        page: 1,
        includeTags,
        window: hotWindow,
      });
    };

    if (modeChanged || windowChanged || tagChanged) {
      fire();
    } else {
      searchDebounceRef.current = setTimeout(fire, 300);
    }

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [currentPage, selectedTag, search, sortMode, hotWindow, runRequestBatch]);

  useEffect(() => {
    if (initialPageLoadRef.current) {
      initialPageLoadRef.current = false;
      return;
    }

    const pendingPageReset = pendingPageResetRef.current;
    if (pendingPageReset) {
      pendingPageResetRef.current = null;
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

      const fire = () => {
        void runRequestBatch({
          tag: requestContextRef.current.tag,
          q: requestContextRef.current.q,
          mode: requestContextRef.current.mode,
          page: currentPage,
          includeTags: pendingPageReset.includeTags,
          window: requestContextRef.current.window,
        });
      };

      if (pendingPageReset.debounce) {
        pendingSearchRef.current = requestContextRef.current.q;
        searchDebounceRef.current = setTimeout(fire, 300);
      } else {
        fire();
      }
      return;
    }

    void runRequestBatch({
      tag: requestContextRef.current.tag,
      q: requestContextRef.current.q,
      mode: requestContextRef.current.mode,
      page: currentPage,
      includeTags: false,
      window: requestContextRef.current.window,
    });
  }, [currentPage, runRequestBatch]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visibleStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const visibleEnd = total === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, total);
  const paginationItems = getPaginationItems(currentPage, totalPages);
  const showPagination = total > PAGE_SIZE && !error;

  const handleScanComplete = useCallback(() => {
    void runRequestBatch({
      tag: selectedTag,
      q: search,
      mode: sortMode,
      page: currentPage,
      includeTags: true,
      window: hotWindow,
    });
  }, [currentPage, selectedTag, search, sortMode, hotWindow, runRequestBatch]);

  const goToPage = useCallback((page: number) => {
    const nextPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(prev => (prev === nextPage ? prev : nextPage));
  }, [totalPages]);

  useEffect(() => {
    return () => {
      projectsAbortRef.current?.abort();
      tagsAbortRef.current?.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
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
                ? '发现正在爆发的 AI 新项目'
                : '跨周期 AI 精选，兼顾长期价值、维护活跃度和技术质量'}
            </p>
          </div>
          <ScanButton />
        </div>

        <ScanProgress />

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Tabs value={sortMode} onValueChange={value => setSortMode(value as ProjectSortMode)}>
              <TabsList>
                <TabsTrigger value="hot">最新最热</TabsTrigger>
                <TabsTrigger value="recommended">AI 推荐</TabsTrigger>
              </TabsList>
            </Tabs>
            {sortMode === 'hot' ? (
              <div className="flex items-center gap-1">
                {HOT_WINDOWS.map(w => (
                  <button
                    key={w.value}
                    onClick={() => setHotWindow(w.value)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      hotWindow === w.value
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {sortMode === 'hot'
              ? '按增长速度排序，发现正在爆发的项目'
              : '按综合质量排序，发现长期优质项目'}
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
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground active:bg-accent"
                aria-label="清除搜索"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {tags.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
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

        {!loading && !error && projects.length > 0 ? (
          <div className="mb-6 flex flex-col gap-2 rounded-xl border bg-card/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                共 {total} 个项目
              </p>
              <p className="text-xs text-muted-foreground">
                当前显示第 {visibleStart}-{visibleEnd} 个
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              第 {currentPage} / {totalPages} 页
            </p>
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
              onClick={() => runRequestBatch({ tag: selectedTag, q: search, mode: sortMode, page: currentPage, includeTags: true, window: hotWindow })}
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
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map(project => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>

            {showPagination ? (
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  可翻页浏览更多项目，切换标签或搜索时会自动回到第一页
                </p>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一页
                  </Button>

                  {paginationItems.map((item, index) => (
                    item === 'ellipsis' ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </span>
                    ) : (
                      <Button
                        key={item}
                        variant={item === currentPage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => goToPage(item)}
                        aria-current={item === currentPage ? 'page' : undefined}
                      >
                        {item}
                      </Button>
                    )
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    下一页
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </main>
    </ScanProvider>
  );
}
