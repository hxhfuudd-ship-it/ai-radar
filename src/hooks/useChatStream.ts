'use client';

import { startTransition, useState, useRef, useEffect, useCallback } from 'react';

let msgCounter = 0;
function nextMsgId() {
  return `msg-${Date.now()}-${++msgCounter}`;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: string;
  done?: boolean;
}

interface UseChatStreamOptions {
  projectContext?: Record<string, unknown>;
}

function trimText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function buildCompactProjectContext(projectContext: Record<string, unknown>) {
  return {
    ...projectContext,
    summary: trimText(projectContext.summary, 280),
    analysis: trimText(projectContext.analysis, 520),
  };
}

export function useChatStream(options: UseChatStreamOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  messagesRef.current = messages;

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isLoading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isLoading]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isLoading) return;

    setInput('');
    const userMsg: ChatMessage = { id: nextMsgId(), role: 'user', content: msg };
    const assistantId = nextMsgId();
    const initialStatus = options.projectContext
      ? '正在读取项目资料...'
      : '正在准备回答...';
    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', status: initialStatus },
    ]);
    setIsLoading(true);

    let accumulated = '';
    let rafId: number | null = null;
    let currentStatus = initialStatus;
    let hasFirstContent = false;

    const flushContent = () => {
      rafId = null;
      startTransition(() => {
        setMessages(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(m => m.id === assistantId);
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              content: accumulated,
              status: currentStatus,
            };
          }
          return updated;
        });
      });
    };

    try {
      const historyLimit = options.projectContext ? 4 : 8;
      const history = messagesRef.current.slice(-historyLimit).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const body: Record<string, unknown> = { message: msg, history };
      if (options.projectContext) {
        body.projectContext = buildCompactProjectContext(options.projectContext);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error('Chat request failed');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader');

      let sseBuffer = '';
      let streamDone = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') {
            streamDone = true;
            break;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(String(parsed.error));
            }
            if (parsed.status) {
              currentStatus = String(parsed.status);
              if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
              startTransition(() => {
                setMessages(prev => {
                  const updated = [...prev];
                  const idx = updated.findIndex(m => m.id === assistantId);
                  if (idx >= 0) {
                    updated[idx] = {
                      ...updated[idx],
                      content: accumulated,
                      status: currentStatus,
                    };
                  }
                  return updated;
                });
              });
            }
            if (parsed.content) {
              if (!hasFirstContent) {
                hasFirstContent = true;
                currentStatus = '正在逐步回答...';
              }
              accumulated += parsed.content;
              if (!rafId) {
                rafId = requestAnimationFrame(flushContent);
              }
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== data) {
              throw parseErr; // re-throw real errors (e.g. parsed.error)
            }
            // skip malformed JSON chunks
          }
        }

        if (streamDone) {
          await reader.cancel();
          break;
        }
      }
    } catch (err) {
      if (!accumulated) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          accumulated = '请求超时，AI 服务暂时无法响应。请稍后重试。';
        } else {
          const msg = err instanceof Error ? err.message : '';
          accumulated = msg.includes('AuthenticationError')
            ? 'AI 服务 API Key 已失效，请联系管理员更新配置。'
            : `抱歉，AI 服务出现了错误。${msg ? `（${msg.slice(0, 100)}）` : '请稍后重试。'}`;
        }
      }
    } finally {
      if (rafId) cancelAnimationFrame(rafId);
      startTransition(() => {
        setMessages(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(m => m.id === assistantId);
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              content: accumulated,
              status: undefined,
              done: true,
            };
          }
          return updated;
        });
      });
      setIsLoading(false);
    }
  }, [input, isLoading, options.projectContext]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    elapsed,
    scrollRef,
    sendMessage,
    handleKeyDown,
  };
}
