export type LLMProvider = 'dashscope' | 'deepseek' | 'openai' | 'custom';

export interface ProviderConfig {
  baseURL: string;
  apiKey: string;
  models: {
    fast: string;
    smart: string;
  };
}

function env(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

const providerDefaults: Record<LLMProvider, { baseURL: string; fast: string; smart: string }> = {
  dashscope: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    fast: 'qwen-turbo',
    smart: 'qwen-plus',
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    fast: 'deepseek-chat',
    smart: 'deepseek-chat',
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    fast: 'gpt-4o-mini',
    smart: 'gpt-4o',
  },
  custom: {
    baseURL: '',
    fast: '',
    smart: '',
  },
};

function buildProviderConfig(provider: LLMProvider): ProviderConfig {
  const prefix = provider.toUpperCase();
  const defaults = providerDefaults[provider];

  return {
    baseURL: env(`${prefix}_BASE_URL`, defaults.baseURL),
    apiKey: env(`${prefix}_API_KEY`),
    models: {
      fast: env(`${prefix}_MODEL_FAST`, defaults.fast),
      smart: env(`${prefix}_MODEL_SMART`, defaults.smart),
    },
  };
}

export function getProviderConfig(provider: LLMProvider): ProviderConfig {
  return buildProviderConfig(provider);
}

export const defaultProvider: LLMProvider =
  (env('DEFAULT_PROVIDER', 'dashscope') as LLMProvider);

export const APP_CONFIG = {
  dbPath: './data/ai-radar.db',
  scanIntervalHours: 12,
  maxProjectsPerScan: 30,
  githubTopics: [
    'llm', 'agent', 'mcp', 'rag', 'langchain', 'multi-agent',
    'ai-agent', 'model-context-protocol', 'autonomous-agent',
    'generative-ai', 'large-language-model', 'prompt-engineering',
  ],
};
