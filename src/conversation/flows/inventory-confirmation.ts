import type { User } from '../../services/user.js';
import { setConversationState } from '../../services/user.js';
import { getInventory, keepOnlyIds } from '../../services/inventory.js';
import { ConversationState } from '../state.js';
import { getLlm } from '../../llm/adapter.js';
import { buildSystemPrompt } from '../prompt-builder.js';
import { parseResponse } from '../response-parser.js';

export async function handleInventoryConfirmation(user: User, text: string): Promise<string> {
  const checklistIds = (user.state_context.inventory_checklist as number[]) || [];
  const inventory = getInventory(user.phone_number);

  // Use LLM to parse the response
  const systemPrompt = buildSystemPrompt(user, ConversationState.AWAITING_INVENTORY_CONFIRM, user.state_context);
  const response = await getLlm().chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ]);
  const parsed = parseResponse(response.content);
  const keepIndices = (parsed.data?.keep_indices as number[]) || [];

  // Map indices back to inventory item IDs
  const idsToKeep: number[] = [];
  for (const idx of keepIndices) {
    if (idx >= 0 && idx < checklistIds.length) {
      idsToKeep.push(checklistIds[idx]);
    }
  }

  // Also keep any items not in the checklist (shouldn't happen, but safety)
  const checklistIdSet = new Set(checklistIds);
  for (const item of inventory) {
    if (!checklistIdSet.has(item.id)) {
      idsToKeep.push(item.id);
    }
  }

  keepOnlyIds(user.phone_number, idsToKeep);

  const removed = checklistIds.length - keepIndices.length;
  const kept = keepIndices.length;

  // Transition to idle — the scheduler will trigger meal planning next
  setConversationState(user.phone_number, ConversationState.IDLE, {
    trigger_meal_plan: true,
  });

  if (removed === 0) {
    return `Great, you still have everything! Let me put together your meal plan...`;
  } else {
    return `Updated! Kept ${kept} items, removed ${removed}. Let me put together your meal plan...`;
  }
}
