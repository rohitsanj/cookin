export interface ParsedLlmResponse {
  intent: string;
  reply: string;
  data?: Record<string, unknown>;
}

export function parseResponse(raw: string): ParsedLlmResponse {
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed.intent || !parsed.reply) {
      return {
        intent: parsed.intent || 'unknown',
        reply: parsed.reply || raw,
        data: parsed.data,
      };
    }

    return parsed as ParsedLlmResponse;
  } catch {
    // Fallback: treat the entire response as a plain text reply
    console.warn('Failed to parse LLM JSON response, using raw text');
    return {
      intent: 'unknown',
      reply: raw,
    };
  }
}
