import { NextRequest } from 'next/server';
import { chatWithAdvisor } from '@/lib/agents/advisor';
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
      try {
        const responses = await chatWithAdvisor(message, history, projectContext);

        for (const resp of responses) {
          if (resp.type === 'status' && resp.status) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: resp.status })}\n\n`));
          } else if (resp.type === 'stream' && resp.stream) {
            for await (const chunk of resp.stream) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
              }
            }
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
        );
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
