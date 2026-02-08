import type { LlmAdapter, ChatMessage, LlmResponse, LlmConfig, ChatOptions } from '../types.js';

export class OpenAiAdapter implements LlmAdapter {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(config: LlmConfig) {
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<LlmResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(m => {
        if (m.role === 'assistant' && m.tool_calls) {
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.tool_calls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
            })),
          };
        }
        if (m.role === 'tool') {
          return {
            role: 'tool',
            tool_call_id: m.tool_call_id,
            content: m.content,
          };
        }
        return { role: m.role, content: m.content };
      }),
      temperature: 0.7,
    };

    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    } else {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const msg = data.choices[0].message;
    const toolCalls = msg.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      content: msg.content || '',
      tool_calls: toolCalls,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      } : undefined,
    };
  }
}
