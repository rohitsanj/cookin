import type { ChatMessage, ChatOptions, ToolCall } from '../llm/types.js';
import type { ToolHandler } from './registry.js';
import { getLlm } from '../llm/adapter.js';

export async function executeWithTools(
  messages: ChatMessage[],
  options: ChatOptions,
  handlers: Map<string, ToolHandler>,
  maxIterations = 10,
): Promise<string> {
  const conversation = [...messages];

  for (let i = 0; i < maxIterations; i++) {
    const response = await getLlm().chat(conversation, options);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      // No tool calls — return the text response
      return response.content;
    }

    // Append assistant message with tool calls
    conversation.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: response.tool_calls,
    });

    // Execute each tool call and append results
    for (const toolCall of response.tool_calls) {
      const result = await executeTool(toolCall, handlers);
      conversation.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      });
    }
  }

  // If we hit max iterations, make one final call without tools to get a response
  console.warn(`Tool execution hit max iterations (${maxIterations}), forcing final response`);
  const finalResponse = await getLlm().chat(conversation);
  return finalResponse.content;
}

async function executeTool(
  toolCall: ToolCall,
  handlers: Map<string, ToolHandler>,
): Promise<string> {
  const handler = handlers.get(toolCall.name);
  if (!handler) {
    console.error(`Unknown tool: ${toolCall.name}`);
    return JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
  }

  try {
    return await handler(toolCall.arguments);
  } catch (err) {
    console.error(`Error executing tool ${toolCall.name}:`, err);
    return JSON.stringify({ error: `Tool execution failed: ${(err as Error).message}` });
  }
}
