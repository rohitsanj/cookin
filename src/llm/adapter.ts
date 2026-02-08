import type { LlmAdapter, LlmConfig } from './types.js';
import { OpenAiAdapter } from './providers/openai.js';
import { AnthropicAdapter } from './providers/anthropic.js';
import { GoogleAdapter } from './providers/google.js';
import { config } from '../config.js';

let instance: LlmAdapter;

export function createLlmAdapter(llmConfig: LlmConfig): LlmAdapter {
  switch (llmConfig.provider) {
    case 'openai':
    case 'openai-compatible':
      return new OpenAiAdapter(llmConfig);
    case 'anthropic':
      return new AnthropicAdapter(llmConfig);
    case 'google':
      return new GoogleAdapter(llmConfig);
    default:
      throw new Error(`Unknown LLM provider: ${llmConfig.provider}`);
  }
}

export function getLlm(): LlmAdapter {
  if (!instance) {
    instance = createLlmAdapter(config.llm);
  }
  return instance;
}
