'use client';

import { useEffect, useState, useCallback, useRef, useDeferredValue } from 'react';
import { Search, X, Radar } from 'lucide-react';
import { ProjectCard } from '@/components/ProjectCard';
import { ScanProvider, ScanButton, ScanProgress } from '@/components/ScanButton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { Project } from '@/lib/db/schema';

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const deferredSearch = useDeferredValue(search);
  const initialLoadRef = useRef(true);

  const fetchProjects = useCallback(async (tag: string | null, q: string) => {
    try {
      const params = new URLSearchParams();
      if (tag) params.set('tag', tag);
      if (q) params.set('search', q);
      const res = await fetch(`/api/projects?${params}`);
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const [, tagsRes] = await Promise.all([
          fetchProjects(null, ''),
          fetch('/api/tags'),
        ]);
        const tagsData = await tagsRes.json();
        setTags((tagsData.tags ?? []).map((t: { name: string }) => t.name));
      } catch {
        // API 失败时仍然结束加载状态
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [fetchProjects]);

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    setLoading(true);
    fetchProjects(selectedTag, deferredSearch).finally(() => setLoading(false));
  }, [selectedTag, deferredSearch, fetchProjects]);

  const handleScanComplete = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchProjects(selectedTag, deferredSearch),
      fetch('/api/tags').then(r => r.json()).then(data => {
        setTags((data.tags ?? []).map((t: { name: string }) => t.name));
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [selectedTag, deferredSearch, fetchProjects]);

  return (
    <ScanProvider onComplete={handleScanComplete}>
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Radar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            追踪 GitHub 上最新的 AI 项目和技术动态
          </p>
        </div>
        <ScanButton />
      </div>

      <ScanProgress />

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
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Radar className="h-8 w-8" />
          </div>
          <p className="text-lg font-medium">还没有项目数据</p>
          <p className="mt-2 text-sm">
            点击上方「扫描最新项目」按钮开始发现 AI 项目
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
