'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { useChatStream } from '@/hooks/useChatStream';

const MarkdownContent = dynamic(
  () => import('@/components/MarkdownContent').then(m => ({ default: m.MarkdownContent })),
  { ssr: false }
);

const SUGGESTIONS = [
  '最近有什么新的 Agent 框架？',
  'MCP 生态最近有什么进展？',
  '推荐一些 RAG 相关的项目',
];

export function ChatPanel() {
  const {
    messages,
    input,
    setInput,
    isLoading,
    scrollRef,
    sendMessage,
    handleKeyDown,
  } = useChatStream();

  const lastMsg = messages[messages.length - 1];
  const isWaiting = isLoading && lastMsg?.role === 'assistant' && lastMsg.content === '';

  const suggestionButtons = useMemo(() => (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map(q => (
        <button
          key={q}
          onClick={() => setInput(q)}
          className="rounded-full border px-4 py-2.5 text-xs transition-colors hover:bg-accent active:bg-accent"
        >
          {q}
        </button>
      ))}
    </div>
  ), [setInput]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <p className="text-lg font-medium">AI Radar 顾问</p>
              <p className="mt-2 text-sm">问我任何关于 AI 技术趋势的问题</p>
              {suggestionButtons}
            </div>
          ) : null}
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <Card
                className={`max-w-[80%] px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {msg.status ? (
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-primary">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                    {msg.status}
                  </div>
                ) : null}
                {msg.role === 'assistant' && msg.content ? (
                  msg.done ? (
                    <MarkdownContent content={msg.content} className="text-sm" />
                  ) : (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {msg.content}
                      <span className="inline-block w-1.5 h-4 ml-0.5 bg-foreground/70 animate-pulse align-middle" />
                    </div>
                  )
                ) : (
                  <div className="text-sm">{msg.content}</div>
                )}
              </Card>
            </div>
          ))}
          {isWaiting ? (
            <div className="flex justify-start">
              <Card className="bg-muted px-4 py-3">
                <div className="flex gap-1">
                  <span className="animate-bounce">·</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>·</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>·</span>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </ScrollArea>
      <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题..."
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button className="min-h-[44px] shrink-0" onClick={() => sendMessage()} disabled={isLoading || !input.trim()}>
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
