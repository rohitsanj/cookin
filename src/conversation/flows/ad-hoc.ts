import type { User } from '../../services/user.js';
import { updateUser } from '../../services/user.js';
import { addItems, removeItem } from '../../services/inventory.js';
import { ConversationState } from '../state.js';
import { getLlm } from '../../llm/adapter.js';
import { buildSystemPrompt } from '../prompt-builder.js';
import { parseResponse } from '../response-parser.js';
import { getRecentMessages } from '../../services/message-throttle.js';
import * as recipeService from '../../services/recipe.js';
import { scheduleUserJobs } from '../../scheduler/index.js';

export async function handleAdHoc(user: User, text: string): Promise<string> {
  const systemPrompt = buildSystemPrompt(user, ConversationState.IDLE, user.state_context);
  const recentMessages = getRecentMessages(user.phone_number, 10);

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...recentMessages.slice(0, -1), // Exclude the current inbound (already logged)
    { role: 'user' as const, content: text },
  ];

  const response = await getLlm().chat(messages);
  const parsed = parseResponse(response.content);

  // Execute side effects based on intent
  switch (parsed.intent) {
    case 'update_inventory': {
      const adds = (parsed.data?.add as Array<{ item_name: string; quantity?: string; category?: string }>) || [];
      const removes = (parsed.data?.remove as string[]) || [];
      if (adds.length > 0) addItems(user.phone_number, adds);
      for (const name of removes) removeItem(user.phone_number, name);
      break;
    }

    case 'change_preferences': {
      const field = parsed.data?.field as string;
      const value = parsed.data?.value;
      if (field && value !== undefined) {
        updateUser(user.phone_number, { [field]: value } as Record<string, unknown>);
      }
      break;
    }

    case 'adjust_schedule': {
      const field = parsed.data?.field as string;
      const value = parsed.data?.value;
      if (field && value !== undefined) {
        updateUser(user.phone_number, { [field]: value } as Record<string, unknown>);
        // Reschedule cron jobs with updated settings
        const updatedUser = { ...user, [field]: value };
        scheduleUserJobs(updatedUser as User);
      }
      break;
    }

    case 'adjust_frequency': {
      const maxMessages = parsed.data?.max_messages_per_day as number;
      if (maxMessages) {
        updateUser(user.phone_number, { max_messages_per_day: maxMessages });
      }
      break;
    }

    case 'rate_recipe': {
      const recipeName = parsed.data?.recipe_name as string;
      const rating = parsed.data?.rating as number;
      const notes = parsed.data?.notes as string | undefined;
      if (recipeName && rating) {
        const existing = recipeService.findRecipeByName(user.phone_number, recipeName);
        if (existing) {
          recipeService.updateRecipeRating(existing.id, rating, notes);
        }
      }
      break;
    }

    case 'modify_recipe': {
      const recipeName = parsed.data?.recipe_name as string;
      const modification = parsed.data?.modification as string;
      if (recipeName && modification) {
        const existing = recipeService.findRecipeByName(user.phone_number, recipeName);
        if (existing) {
          recipeService.updateRecipeModifications(existing.id, modification);
        }
      }
      break;
    }

    // Intents with no side effects: view_plan, browse_recipes, ask_recipe, general_question, greeting, other
    default:
      break;
  }

  return parsed.reply;
}
