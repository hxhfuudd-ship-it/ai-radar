'use client';

import { useEffect, useState, useCallback, use } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectChat } from '@/components/ProjectChat';
import type { Project } from '@/lib/db/schema';

const MarkdownContent = dynamic(
  () => import('@/components/MarkdownContent').then(m => ({ default: m.MarkdownContent })),
  { ssr: false }
);

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

  const toggleBookmark = useCallback(async () => {
    if (!data) return;
    const res = await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: data.project.id }),
    });
    const result = await res.json();
    setBookmarked(result.bookmarked);
  }, [data]);

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-2xl">{project.fullName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.description}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" className="min-h-[44px]" onClick={toggleBookmark}>
            {bookmarked ? '已收藏' : '收藏'}
          </Button>
          <a href={project.url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="min-h-[44px]">GitHub</Button>
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
        {project.repoCreatedAt ? (
          <span className="text-sm text-muted-foreground">
            创建于 {new Date(project.repoCreatedAt).toLocaleDateString('zh-CN')}
          </span>
        ) : null}
        {project.repoUpdatedAt ? (
          <span className="text-sm text-muted-foreground">
            更新于 {new Date(project.repoUpdatedAt).toLocaleDateString('zh-CN')}
          </span>
        ) : null}
        {project.language ? (
          <Badge variant="outline">{project.language}</Badge>
        ) : null}
        {tags.map(tag => (
          <Badge key={tag} variant="secondary">{tag}</Badge>
        ))}
      </div>

      {project.score != null && project.score > 0 ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">推荐指数</span>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-4 w-4 ${
                  i < project.score!
                    ? 'fill-blue-500 text-blue-500'
                    : 'text-muted-foreground/30'
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}

      <Separator className="my-6" />

      {project.summary ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">AI 摘要</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{project.summary}</p>
          </CardContent>
        </Card>
      ) : null}

      {project.analysis ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">深度分析</CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownContent content={project.analysis} />
          </CardContent>
        </Card>
      ) : null}

      <ProjectChat
        project={{
          fullName: project.fullName,
          url: project.url,
          description: project.description,
          stars: project.stars,
          language: project.language,
          topics: project.topics,
          summary: project.summary,
          analysis: project.analysis,
        }}
      />
    </main>
  );
}
