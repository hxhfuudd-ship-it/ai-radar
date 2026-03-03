import type { LLMProvider } from '../config';

export interface Skill {
  name: string;
  description: string;
  provider?: LLMProvider;
  model?: string;
  systemPrompt: string;
  buildUserPrompt: (input: Record<string, string>) => string;
}
