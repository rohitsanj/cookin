import type { LlmAdapter, ChatMessage, LlmResponse, LlmConfig, ChatOptions } from '../types.js';

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export class AnthropicAdapter implements LlmAdapter {
  private apiKey: string;
  private model: string;

  constructor(config: LlmConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<LlmResponse> {
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const systemPrompt = systemMessages.map(m => m.content).join('\n\n');

    // Convert messages to Anthropic format
    const anthropicMessages = this.convertMessages(nonSystemMessages);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt || undefined,
      messages: anthropicMessages,
    };

    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      content: AnthropicContentBlock[];
      usage?: { input_tokens: number; output_tokens: number };
    };

    const textContent = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text || '')
      .join('');

    const toolCalls = data.content
      .filter(block => block.type === 'tool_use')
      .map(block => ({
        id: block.id!,
        name: block.name!,
        arguments: block.input || {},
      }));

    return {
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      } : undefined,
    };
  }

  private convertMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];

    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        // Assistant message with tool calls -> content blocks
        const content: unknown[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
        }
        result.push({ role: 'assistant', content });
      } else if (msg.role === 'tool') {
        // Tool result -> user message with tool_result content block
        // Anthropic groups consecutive tool results into one user message
        const lastMsg = result[result.length - 1];
        const toolResultBlock = {
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content,
        };
        if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
          // Append to existing user message with tool results
          (lastMsg.content as unknown[]).push(toolResultBlock);
        } else {
          result.push({ role: 'user', content: [toolResultBlock] });
        }
      } else {
        result.push({ role: msg.role, content: msg.content });
      }
    }

    return result;
  }
}
