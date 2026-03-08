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

const PROJECT_LOADING_STEPS = [
  { title: '理解问题', hint: '识别你关注的是场景、架构还是对比' },
  { title: '补充资料', hint: '必要时检索外部信息做交叉参考' },
  { title: '整理上下文', hint: '结合项目摘要、分析和历史对话' },
  { title: '生成回答', hint: '组织重点并准备可执行建议' },
];

function resolveProjectStep(status: string | undefined, elapsed: number): number {
  if (status?.includes('理解')) return 0;
  if (status?.includes('搜索') || status?.includes('资料')) return 1;
  if (status?.includes('整理') || status?.includes('上下文')) return 2;
  if (status?.includes('生成') || status?.includes('草稿')) return 3;
  if (elapsed < 3) return 0;
  if (elapsed < 8) return 1;
  if (elapsed < 15) return 2;
  return 3;
}

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
            (() => {
              const currentStep = resolveProjectStep(msg.status, elapsed);
              const liveStatus = msg.status ?? `${PROJECT_LOADING_STEPS[currentStep].title}中...`;

              return (
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
                        <div className="space-y-2.5 py-1">
                          <div className="flex items-center gap-2 text-xs text-primary">
                            <span className="thinking-orbit inline-flex h-2.5 w-2.5 rounded-full bg-primary/90" />
                            <span>{liveStatus}</span>
                          </div>

                          <div className="rounded-md border border-primary/20 bg-background/60 px-2.5 py-2">
                            <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <div className="flex gap-1">
                                <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-foreground/40" />
                                <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-foreground/40" />
                                <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-foreground/40" />
                              </div>
                              <span>AI 正在处理{elapsed > 0 ? `（${elapsed}s）` : ''}</span>
                            </div>

                            <div className="space-y-1.5">
                              {PROJECT_LOADING_STEPS.map((step, idx) => (
                                <div key={step.title} className="flex items-start gap-2">
                                  <span
                                    className={`mt-0.5 inline-block h-1.5 w-1.5 rounded-full ${
                                      idx < currentStep
                                        ? 'bg-primary/80'
                                        : idx === currentStep
                                          ? 'thinking-pulse bg-primary'
                                          : 'bg-muted-foreground/35'
                                    }`}
                                  />
                                  <div className="min-w-0">
                                    <p
                                      className={`text-[11px] leading-tight ${
                                        idx === currentStep
                                          ? 'text-foreground'
                                          : 'text-muted-foreground'
                                      }`}
                                    >
                                      {step.title}
                                    </p>
                                    {idx === currentStep ? (
                                      <p className="text-[10px] text-muted-foreground/90">
                                        {step.hint}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
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
              );
            })()
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
