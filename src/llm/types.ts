export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LlmAdapter {
  chat(messages: ChatMessage[]): Promise<LlmResponse>;
}

export interface LlmConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'openai-compatible';
  apiKey: string;
  model: string;
  baseUrl?: string;
}
