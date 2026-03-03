'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Project } from '@/lib/db/schema';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const tags = project.topics?.split(',').filter(Boolean) ?? [];

  return (
    <Link href={`/project/${project.id}`}>
      <Card className="transition-all hover:shadow-md hover:border-foreground/20 cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight line-clamp-1">
              {project.fullName}
            </CardTitle>
            <span className="shrink-0 text-sm text-muted-foreground">
              {project.stars?.toLocaleString()} stars
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground line-clamp-3">
            {project.summary ?? project.description ?? '暂无描述'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {project.language && (
              <Badge variant="outline" className="text-xs">
                {project.language}
              </Badge>
            )}
            {tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          {project.score != null && project.score > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>推荐指数</span>
              <span className="text-foreground font-medium">
                {'★'.repeat(project.score)}{'☆'.repeat(5 - project.score)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
