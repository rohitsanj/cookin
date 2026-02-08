import type { LlmAdapter, ChatMessage, LlmResponse, LlmConfig } from '../types.js';

export class GoogleAdapter implements LlmAdapter {
  private apiKey: string;
  private model: string;

  constructor(config: LlmConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async chat(messages: ChatMessage[]): Promise<LlmResponse> {
    // Gemini uses a different format: system instruction + contents with role "user"/"model"
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const systemInstruction = systemMessages.length > 0
      ? { parts: [{ text: systemMessages.map(m => m.content).join('\n\n') }] }
      : undefined;

    const contents = nonSystemMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction,
        contents,
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Gemini API error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    const text = data.candidates[0].content.parts.map(p => p.text).join('');

    return {
      content: text,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
      } : undefined,
    };
  }
}
