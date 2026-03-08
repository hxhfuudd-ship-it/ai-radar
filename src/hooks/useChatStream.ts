'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

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
    summary: trimText(projectContext.summary, 500),
    analysis: trimText(projectContext.analysis, 1200),
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
    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setIsLoading(true);

    let accumulated = '';
    let rafId: number | null = null;

    const flushContent = () => {
      rafId = null;
      setMessages(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(m => m.id === assistantId);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], content: accumulated, status: undefined };
        }
        return updated;
      });
    };

    try {
      const history = messagesRef.current.slice(-8).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const body: Record<string, unknown> = { message: msg, history };
      if (options.projectContext) {
        body.projectContext = buildCompactProjectContext(options.projectContext);
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Chat request failed');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader');

      let sseBuffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.status) {
              if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
              setMessages(prev => {
                const updated = [...prev];
                const idx = updated.findIndex(m => m.id === assistantId);
                if (idx >= 0) {
                  updated[idx] = { ...updated[idx], content: accumulated, status: parsed.status };
                }
                return updated;
              });
            }
            if (parsed.content) {
              accumulated += parsed.content;
              if (!rafId) {
                rafId = requestAnimationFrame(flushContent);
              }
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch {
      if (!accumulated) {
        accumulated = '抱歉，出现了错误。请稍后重试。';
      }
    } finally {
      if (rafId) cancelAnimationFrame(rafId);
      setMessages(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(m => m.id === assistantId);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], content: accumulated, done: true };
        }
        return updated;
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
