import { NextRequest } from 'next/server';
import { chatWithAdvisor } from '@/lib/agents/advisor';
import type { AdvisorResponse } from '@/lib/agents/advisor';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ProjectContext } from '@/lib/agents/advisor';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { message, history = [], projectContext } = body as {
    message: string;
    history: ChatCompletionMessageParam[];
    projectContext?: ProjectContext;
  };

  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const enqueue = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      const emit = async (resp: AdvisorResponse) => {
        if (resp.type === 'status' && resp.status) {
          enqueue(JSON.stringify({ status: resp.status }));
        } else if (resp.type === 'stream' && resp.stream) {
          for await (const chunk of resp.stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              enqueue(JSON.stringify({ content }));
            }
          }
        }
      };

      try {
        await chatWithAdvisor(message, history, projectContext, emit);
        enqueue('[DONE]');
        controller.close();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[chat API] Error:', errMsg);
        enqueue(JSON.stringify({ error: errMsg }));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
