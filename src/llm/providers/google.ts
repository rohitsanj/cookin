import type { LlmAdapter, ChatMessage, LlmResponse, LlmConfig, ChatOptions } from '../types.js';

export class GoogleAdapter implements LlmAdapter {
  private apiKey: string;
  private model: string;

  constructor(config: LlmConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<LlmResponse> {
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const systemInstruction = systemMessages.length > 0
      ? { parts: [{ text: systemMessages.map(m => m.content).join('\n\n') }] }
      : undefined;

    const contents = this.convertMessages(nonSystemMessages);

    const body: Record<string, unknown> = {
      systemInstruction,
      contents,
      generationConfig: {
        temperature: 0.7,
      },
    };

    if (options?.webSearch) {
      body.tools = [{ google_search: {} }];
    } else if (options?.tools && options.tools.length > 0) {
      body.tools = [{
        functionDeclarations: options.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }];
    } else {
      // Only force JSON when no tools/search are provided
      (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Gemini API error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      candidates: Array<{
        content: {
          parts: Array<{
            text?: string;
            functionCall?: { name: string; args: Record<string, unknown> };
          }>;
        };
      }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    const parts = data.candidates[0].content.parts;
    const textContent = parts.filter(p => p.text).map(p => p.text!).join('');

    const toolCalls = parts
      .filter(p => p.functionCall)
      .map((p, i) => ({
        id: `gemini-tc-${i}-${Date.now()}`,
        name: p.functionCall!.name,
        arguments: p.functionCall!.args,
      }));

    return {
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
      } : undefined,
    };
  }

  private convertMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];

    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        const parts: unknown[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          parts.push({ functionCall: { name: tc.name, args: tc.arguments } });
        }
        result.push({ role: 'model', parts });
      } else if (msg.role === 'tool') {
        // Gemini uses functionResponse parts in a "user" role (or "function" in some versions)
        const lastMsg = result[result.length - 1];
        const frPart = {
          functionResponse: {
            name: msg.tool_call_id, // We'll store the tool name in tool_call_id for Gemini
            response: { result: msg.content },
          },
        };
        // Group consecutive tool responses
        if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.parts)) {
          const parts = lastMsg.parts as Array<Record<string, unknown>>;
          if (parts.some(p => 'functionResponse' in p)) {
            parts.push(frPart);
            continue;
          }
        }
        result.push({ role: 'user', parts: [frPart] });
      } else {
        result.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return result;
  }
}
