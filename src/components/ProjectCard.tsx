'use client';

import Link from 'next/link';
import { Star, GitFork } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Project } from '@/lib/db/schema';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRelative(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return formatDate(dateStr);
}

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const tags = project.topics?.split(',').filter(Boolean) ?? [];

  return (
    <Link href={`/project/${project.id}`}>
      <Card className="group flex h-full flex-col cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-foreground/20 hover:-translate-y-0.5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight line-clamp-1">
              {project.fullName}
            </CardTitle>
            <div className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {project.stars?.toLocaleString()}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <p className="text-sm text-muted-foreground line-clamp-3">
            {project.summary ?? project.description ?? '暂无描述'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {project.language ? (
              <Badge variant="outline" className="text-xs">
                {project.language}
              </Badge>
            ) : null}
            {tags.slice(0, 4).map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
            {project.score != null && project.score > 0 ? (
              <div className="flex items-center gap-1">
                <span>推荐指数</span>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3 w-3 ${
                        i < project.score!
                          ? 'fill-blue-500 text-blue-500'
                          : 'text-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ) : <span />}
            <div className="flex items-center gap-2">
              {project.forks != null && project.forks > 0 ? (
                <span className="flex items-center gap-0.5">
                  <GitFork className="h-3 w-3" />
                  {project.forks.toLocaleString()}
                </span>
              ) : null}
              {project.repoUpdatedAt ? (
                <span>更新 {formatRelative(project.repoUpdatedAt)}</span>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
