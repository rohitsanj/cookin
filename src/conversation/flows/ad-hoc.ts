import type { User } from '../../services/user.js';
import type { ChatMessage } from '../../llm/types.js';
import { buildSystemPrompt } from '../prompt-builder.js';
import { ConversationState } from '../state.js';
import { getRecentMessages } from '../../services/message-throttle.js';
import { getToolsForUser } from '../../tools/registry.js';
import { executeWithTools } from '../../tools/executor.js';

export async function handleAdHoc(user: User, text: string): Promise<string> {
  const systemPrompt = buildSystemPrompt(user, ConversationState.IDLE, user.state_context);
  const recentMessages = getRecentMessages(user.phone_number, 10);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...recentMessages.slice(0, -1),
    { role: 'user', content: text },
  ];

  const { tools, handlers } = getToolsForUser(user.phone_number);

  return executeWithTools(messages, { tools }, handlers);
}
