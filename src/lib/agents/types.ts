import type { LLMProvider } from '../config';

export interface AgentConfig {
  name: string;
  role: string;
  provider?: LLMProvider;
  model?: string;
  systemPrompt: string;
}

export interface ScanResult {
  projects: RawProject[];
  scannedAt: string;
}

export interface RawProject {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisResult {
  projectId: string;
  summary: string;
  analysis: string;
  tags: string[];
  score: number;
}
