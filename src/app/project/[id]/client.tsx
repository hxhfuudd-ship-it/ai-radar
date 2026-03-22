'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { ProjectChat } from '@/components/ProjectChat';
import type { ProjectContext } from '@/lib/agents/advisor';

const MarkdownContent = dynamic(
  () => import('@/components/MarkdownContent').then(m => ({ default: m.MarkdownContent })),
  { ssr: false, loading: () => <div className="animate-pulse h-40 rounded bg-muted" /> }
);

export function BookmarkButton({ projectId, initialBookmarked }: { projectId: string; initialBookmarked: boolean }) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, setPending] = useState(false);

  const toggle = useCallback(async () => {
    setPending(true);
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const result = await res.json();
      setBookmarked(result.bookmarked);
    } finally {
      setPending(false);
    }
  }, [projectId]);

  return (
    <Button variant="outline" className="min-h-[44px]" onClick={toggle} disabled={pending}>
      {bookmarked ? '已收藏' : '收藏'}
    </Button>
  );
}

/**
 * 将分析报告中的【标题】转换为 Markdown 标题格式，
 * 确保标题独占一行，描述文字另起一行。
 */
function formatAnalysis(raw: string): string {
  return raw.replace(/【([^】]+)】\s*/g, '\n\n## $1\n\n');
}

export function AnalysisContent({ content }: { content: string }) {
  return <MarkdownContent content={formatAnalysis(content)} className="analysis-markdown" />;
}

export function ProjectChatWrapper({ project }: { project: ProjectContext }) {
  return <ProjectChat project={project} />;
}
