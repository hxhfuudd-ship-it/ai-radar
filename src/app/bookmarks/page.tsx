'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bookmark, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import type { Project } from '@/lib/db/schema';

interface BookmarkItem {
  id: number;
  projectId: string;
  note: string | null;
  createdAt: string;
  project: Project;
}

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    void fetch('/api/bookmarks')
      .then(res => res.json())
      .then(data => {
        setBookmarks(data.bookmarks ?? []);
      })
      .catch(() => {
        setBookmarks([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function removeBookmark(projectId: string) {
    await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    setBookmarks(prev => prev.filter(b => b.projectId !== projectId));
  }

  function startEditNote(bookmark: BookmarkItem) {
    setEditingId(bookmark.projectId);
    setNoteText(bookmark.note ?? '');
  }

  async function saveNote(projectId: string) {
    await fetch('/api/bookmarks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, note: noteText.trim() || null }),
    });
    setBookmarks(prev =>
      prev.map(b =>
        b.projectId === projectId
          ? { ...b, note: noteText.trim() || null }
          : b,
      ),
    );
    setEditingId(null);
    setNoteText('');
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold">我的收藏</h1>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">我的收藏</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {bookmarks.length > 0
            ? `共收藏了 ${bookmarks.length} 个项目`
            : '还没有收藏任何项目'}
        </p>
      </div>

      {bookmarks.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Bookmark className="h-8 w-8" />
          </div>
          <p className="text-lg font-medium">收藏夹是空的</p>
          <p className="mt-2 text-sm">
            在项目详情页点击「收藏」按钮来添加项目
          </p>
          <Link href="/">
            <Button variant="link" className="mt-4">
              去发现项目
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookmarks.map(bm => {
            const { project } = bm;
            const tags = project.topics?.split(',').filter(Boolean) ?? [];
            const isEditing = editingId === bm.projectId;

            return (
              <Card key={bm.id} className="transition-all hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/project/${project.id}`}
                        className="hover:underline"
                      >
                        <CardTitle className="text-base leading-tight">
                          {project.fullName}
                        </CardTitle>
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {project.summary ?? project.description ?? '暂无描述'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <a
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" className="min-h-[44px]">
                          GitHub
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        className="min-h-[44px] text-destructive hover:text-destructive"
                        onClick={() => removeBookmark(bm.projectId)}
                      >
                        取消收藏
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {project.stars?.toLocaleString()}
                    </span>
                    {project.language ? (
                      <Badge variant="outline" className="text-xs">
                        {project.language}
                      </Badge>
                    ) : null}
                    {tags.slice(0, 5).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {project.score != null && project.score > 0 ? (
                      <span className="ml-auto flex items-center gap-0.5">
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
                      </span>
                    ) : null}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="写点笔记..."
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        rows={3}
                        className="text-sm"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveNote(bm.projectId)}
                        >
                          保存
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(null);
                            setNoteText('');
                          }}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="group cursor-pointer rounded-md border border-dashed border-border px-3 py-3 transition-colors hover:bg-muted/50 active:bg-muted/70"
                      onClick={() => startEditNote(bm)}
                    >
                      {bm.note ? (
                        <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                          {bm.note}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground/60">
                          点击添加笔记...
                        </p>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    收藏于{' '}
                    {new Date(bm.createdAt).toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
