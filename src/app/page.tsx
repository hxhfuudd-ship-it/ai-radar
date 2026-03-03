'use client';

import { useEffect, useState, useCallback } from 'react';
import { ProjectCard } from '@/components/ProjectCard';
import { ScanButton } from '@/components/ScanButton';
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

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedTag) params.set('tag', selectedTag);
    if (search) params.set('search', search);
    const res = await fetch(`/api/projects?${params}`);
    const data = await res.json();
    setProjects(data.projects ?? []);
    setLoading(false);
  }, [selectedTag, search]);

  const fetchTags = useCallback(async () => {
    const res = await fetch('/api/tags');
    const data = await res.json();
    setTags((data.tags ?? []).map((t: { name: string }) => t.name));
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchTags();
  }, [fetchProjects, fetchTags]);

  useEffect(() => {
    const timer = setTimeout(fetchProjects, 300);
    return () => clearTimeout(timer);
  }, [search, fetchProjects]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Radar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            追踪 GitHub 上最新的 AI 项目和技术动态
          </p>
        </div>
        <ScanButton onComplete={() => { fetchProjects(); fetchTags(); }} />
      </div>

      <div className="mb-4">
        <Input
          placeholder="搜索项目名称、描述、标签..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {tags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Badge
            variant={selectedTag === null ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedTag(null)}
          >
            全部
          </Badge>
          {tags.slice(0, 15).map((tag) => (
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
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <p className="text-lg">还没有项目数据</p>
          <p className="mt-2 text-sm">
            点击上方「扫描最新项目」按钮开始发现 AI 项目
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </main>
  );
}
