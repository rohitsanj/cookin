import type { User } from '../../services/user.js';
import { setConversationState } from '../../services/user.js';
import { addItems } from '../../services/inventory.js';
import { ConversationState } from '../state.js';
import { getLlm } from '../../llm/adapter.js';
import { buildSystemPrompt } from '../prompt-builder.js';
import { parseResponse } from '../response-parser.js';
import * as mealPlanService from '../../services/meal-plan.js';

export async function handleGroceryConfirmation(user: User, text: string): Promise<string> {
  const systemPrompt = buildSystemPrompt(user, ConversationState.AWAITING_GROCERY_CONFIRM, user.state_context);
  const response = await getLlm().chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ]);
  const parsed = parseResponse(response.content);

  const boughtItems = (parsed.data?.bought_items as Array<{ item_name: string; quantity?: string; category?: string }>) || [];

  if (boughtItems.length > 0) {
    addItems(user.phone_number, boughtItems);
  }

  // Mark grocery list as fulfilled if they got everything
  const planId = user.state_context.plan_id as string;
  if (planId && parsed.data?.got_everything) {
    const groceryList = mealPlanService.getGroceryList(planId);
    if (groceryList) {
      mealPlanService.fulfillGroceryList(groceryList.id);
    }
  }

  setConversationState(user.phone_number, ConversationState.IDLE);
  return parsed.reply || "Got it! Your inventory is updated. Happy cooking!";
}
