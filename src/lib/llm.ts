import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getProviderConfig, defaultProvider, type LLMProvider } from './config';

type ModelTier = 'fast' | 'smart';

interface ChatOptions {
  messages: ChatCompletionMessageParam[];
  provider?: LLMProvider;
  model?: string;
  tier?: ModelTier;
  temperature?: number;
  maxTokens?: number;
  stream?: false;
}

interface StreamChatOptions extends Omit<ChatOptions, 'stream'> {
  stream: true;
}

const clientCache = new Map<string, OpenAI>();

function getClient(provider: LLMProvider): OpenAI {
  const config = getProviderConfig(provider);
  const cacheKey = `${provider}:${config.baseURL}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
  clientCache.set(cacheKey, client);
  return client;
}

function resolveModel(provider: LLMProvider, model?: string, tier: ModelTier = 'smart'): string {
  if (model) return model;
  return getProviderConfig(provider).models[tier];
}

export async function chat(options: ChatOptions): Promise<string> {
  const provider = options.provider ?? defaultProvider;
  const client = getClient(provider);
  const model = resolveModel(provider, options.model, options.tier);

  const response = await client.chat.completions.create({
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
  });

  return response.choices[0]?.message?.content ?? '';
}

export async function chatStream(options: StreamChatOptions) {
  const provider = options.provider ?? defaultProvider;
  const client = getClient(provider);
  const model = resolveModel(provider, options.model, options.tier);

  return client.chat.completions.create({
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
  });
}

export function systemMessage(content: string): ChatCompletionMessageParam {
  return { role: 'system', content };
}

export function userMessage(content: string): ChatCompletionMessageParam {
  return { role: 'user', content };
}

export function assistantMessage(content: string): ChatCompletionMessageParam {
  return { role: 'assistant', content };
}
