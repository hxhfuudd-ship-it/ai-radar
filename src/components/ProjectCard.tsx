'use client';

import React from 'react';
import Link from 'next/link';
import { Star, GitFork, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Project } from '@/lib/db/schema';

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function getVelocity(project: Project): number {
  if (!project.stars) return 0;

  if (project.previousStars != null && project.previousStarsAt) {
    const hoursSince = (Date.now() - new Date(project.previousStarsAt).getTime()) / 3_600_000;
    if (hoursSince >= 12) {
      return (project.stars - project.previousStars) / (hoursSince / 24);
    }
  }

  if (!project.repoCreatedAt) return 0;
  const age = Math.max(1, daysSince(project.repoCreatedAt));
  return project.stars / age;
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

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

export const ProjectCard = React.memo(function ProjectCard({ project }: ProjectCardProps) {
  const tags = project.topics?.split(',').filter(Boolean) ?? [];
  const isNew = daysSince(project.discoveredAt) <= 1;
  const velocity = getVelocity(project);
  const isTrending = velocity > 30;

  return (
    <Link href={`/project/${project.id}`}>
      <Card className="group flex h-full flex-col cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-foreground/20 hover:-translate-y-0.5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="min-w-0 shrink text-base leading-tight">
              {project.fullName.length > 17 ? project.fullName.slice(0, 17) + '...' : project.fullName}
            </CardTitle>
            <div className="flex shrink-0 items-center gap-1.5">
              {isNew ? (
                <Badge variant="default" className="bg-emerald-500 px-1.5 py-0 text-[10px] font-bold text-white hover:bg-emerald-500">
                  NEW
                </Badge>
              ) : isTrending ? (
                <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
              ) : null}
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="text-sm text-muted-foreground">{formatStars(project.stars ?? 0)}</span>
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
              <div className="flex shrink-0 items-center gap-1">
                <span className="whitespace-nowrap">推荐指数</span>
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
            ) : <span />}
            <div className="flex items-center gap-2">
              {project.forks != null && project.forks > 0 ? (
                <span className="flex items-center gap-0.5">
                  <GitFork className="h-3 w-3" />
                  {formatStars(project.forks)}
                </span>
              ) : null}
              {project.repoCreatedAt ? (
                <span className="whitespace-nowrap">{formatRelative(project.repoCreatedAt)}</span>
              ) : project.repoUpdatedAt ? (
                <span className="whitespace-nowrap">{formatRelative(project.repoUpdatedAt)}</span>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});
