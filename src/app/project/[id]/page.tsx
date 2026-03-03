'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type { Project } from '@/lib/db/schema';

interface ProjectDetail {
  project: Project;
  tags: string[];
  isBookmarked: boolean;
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const detail = await res.json();
        setData(detail);
        setBookmarked(detail.isBookmarked);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function toggleBookmark() {
    if (!data) return;
    const res = await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: data.project.id }),
    });
    const result = await res.json();
    setBookmarked(result.bookmarked);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="mb-2 h-4 w-3/4" />
        <Skeleton className="mt-6 h-64 w-full rounded-xl" />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-lg text-muted-foreground">项目不存在</p>
        <Link href="/">
          <Button variant="link" className="mt-4">返回首页</Button>
        </Link>
      </main>
    );
  }

  const { project, tags } = data;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-2">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回列表
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{project.fullName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.description}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={toggleBookmark}>
            {bookmarked ? '已收藏' : '收藏'}
          </Button>
          <a href={project.url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">GitHub</Button>
          </a>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {project.stars?.toLocaleString()} stars
        </span>
        <span className="text-sm text-muted-foreground">
          {project.forks?.toLocaleString()} forks
        </span>
        {project.language && (
          <Badge variant="outline">{project.language}</Badge>
        )}
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary">{tag}</Badge>
        ))}
      </div>

      {project.score != null && project.score > 0 && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">推荐指数</span>
          <span className="font-medium">
            {'★'.repeat(project.score)}{'☆'.repeat(5 - project.score)}
          </span>
        </div>
      )}

      <Separator className="my-6" />

      {project.summary && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">AI 摘要</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{project.summary}</p>
          </CardContent>
        </Card>
      )}

      {project.analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">深度分析</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {project.analysis}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
