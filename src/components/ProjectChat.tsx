'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useChatStream } from '@/hooks/useChatStream';
import type { ProjectContext } from '@/lib/agents/advisor';

const MarkdownContent = dynamic(
  () => import('@/components/MarkdownContent').then(m => ({ default: m.MarkdownContent })),
  { ssr: false }
);

const QUICK_QUESTIONS = [
  '这个项目解决了什么问题？',
  '适合什么场景使用？',
  '技术架构是怎样的？',
  '有哪些类似的替代方案？',
];

interface ProjectChatProps {
  project: ProjectContext;
}

export function ProjectChat({ project }: ProjectChatProps) {
  const [open, setOpen] = useState(false);

  const projectContext = useMemo(
    () => project as unknown as Record<string, unknown>,
    [project]
  );

  const {
    messages,
    input,
    setInput,
    isLoading,
    elapsed,
    scrollRef,
    sendMessage,
    handleKeyDown,
  } = useChatStream({ projectContext });

  if (!open) {
    return (
      <Card
        className="cursor-pointer border-dashed transition-all hover:border-foreground/30 hover:shadow-sm"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium">AI 问答</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              对这个项目有疑问？点击展开，AI 为你解答
            </p>
          </div>
          <span className="text-lg">💬</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <p className="text-sm font-medium">AI 问答 — {project.fullName}</p>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => setOpen(false)}
        >
          收起
        </Button>
      </div>

      <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto p-4 sm:max-h-[400px]">
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">
                问我任何关于这个项目的问题
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {QUICK_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="rounded-full border px-4 py-2.5 text-xs transition-colors hover:bg-accent active:bg-accent"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {msg.role === 'assistant' ? (
                  msg.content ? (
                    <div className={msg.done ? '' : 'content-appear'}>
                      <MarkdownContent
                        content={msg.content}
                        className="text-sm"
                        isStreaming={!msg.done}
                      />
                    </div>
                  ) : !msg.done ? (
                    <div className="space-y-2 py-0.5">
                      {msg.status ? (
                        <div className="flex items-center gap-1.5 text-xs text-primary">
                          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                          {msg.status}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <div className="flex gap-1">
                          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-foreground/40" />
                          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-foreground/40" />
                          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-foreground/40" />
                        </div>
                        <span>AI 正在思考{elapsed > 0 ? `（${elapsed}s）` : ''}</span>
                      </div>
                      <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted-foreground/10">
                        <div className="thinking-shimmer h-full w-1/3 rounded-full bg-primary/30" />
                      </div>
                    </div>
                  ) : null
                ) : (
                  <div className="text-sm leading-relaxed">{msg.content}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t p-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题..."
            className="min-h-[44px] max-h-24 resize-none text-sm"
            rows={1}
          />
          <Button
            className="min-h-[44px] shrink-0"
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
          >
            发送
          </Button>
        </div>
      </div>
    </Card>
  );
}
