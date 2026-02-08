export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
}

export interface ChatOptions {
  tools?: ToolDefinition[];
  webSearch?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface LlmResponse {
  content: string;
  tool_calls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LlmAdapter {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<LlmResponse>;
}

export interface LlmConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'openai-compatible';
  apiKey: string;
  model: string;
  baseUrl?: string;
}
