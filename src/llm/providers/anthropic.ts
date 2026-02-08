import type { LlmAdapter, ChatMessage, LlmResponse, LlmConfig } from '../types.js';

export class AnthropicAdapter implements LlmAdapter {
  private apiKey: string;
  private model: string;

  constructor(config: LlmConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async chat(messages: ChatMessage[]): Promise<LlmResponse> {
    // Anthropic uses a separate system parameter, not a system role in messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const systemPrompt = systemMessages.map(m => m.content).join('\n\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt || undefined,
        messages: nonSystemMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const text = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      content: text,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      } : undefined,
    };
  }
}
