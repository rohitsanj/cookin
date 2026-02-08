import { getOrCreateUser, setConversationState } from '../services/user.js';
import { getInventory } from '../services/inventory.js';
import { getMealForDay, getCurrentPlan } from '../services/meal-plan.js';
import { sendTextMessage } from '../whatsapp/sender.js';
import { ConversationState } from '../conversation/state.js';
import { generateAndSendMealPlan } from '../conversation/flows/meal-plan-negotiation.js';

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

export async function triggerInventoryConfirmation(phoneNumber: string): Promise<void> {
  const user = getOrCreateUser(phoneNumber);

  // Don't interrupt if user is in the middle of something
  if (user.conversation_state !== ConversationState.IDLE) {
    console.log(`Skipping inventory confirmation for ${phoneNumber} — state is ${user.conversation_state}`);
    return;
  }

  const items = getInventory(phoneNumber);

  if (items.length === 0) {
    // No inventory to confirm — go straight to meal planning
    await triggerMealPlan(phoneNumber);
    return;
  }

  // Build numbered checklist
  const checklist = items.map((item, i) => {
    let line = `${i + 1}. ${item.item_name}`;
    if (item.quantity) line += ` (${item.quantity})`;
    if (item.is_staple) {
      line += ' [staple]';
    } else {
      line += ` — added ${formatRelativeDate(item.last_updated)}`;
    }
    return line;
  }).join('\n');

  const message = `Before I plan this week, let me check what you have.\n\nHere's what I think is in your kitchen:\n${checklist}\n\nReply with the numbers you still have, e.g. "1,2,3,5"\nOr reply "all" / "none"`;

  setConversationState(phoneNumber, ConversationState.AWAITING_INVENTORY_CONFIRM, {
    inventory_checklist: items.map(i => i.id),
  });

  await sendTextMessage(phoneNumber, message, true);
}

async function triggerMealPlan(phoneNumber: string): Promise<void> {
  const user = getOrCreateUser(phoneNumber);
  const reply = await generateAndSendMealPlan(user);
  await sendTextMessage(phoneNumber, reply, true);
}

export async function triggerCookReminder(phoneNumber: string, day: string): Promise<void> {
  const user = getOrCreateUser(phoneNumber);

  // Don't interrupt if user is in the middle of something
  if (user.conversation_state !== ConversationState.IDLE) {
    console.log(`Skipping cook reminder for ${phoneNumber} — state is ${user.conversation_state}`);
    return;
  }

  const meal = getMealForDay(phoneNumber, day);
  if (!meal) {
    console.log(`No pending meal for ${phoneNumber} on ${day}`);
    return;
  }

  // Format the recipe
  const ingredientsList = meal.ingredients
    .map(i => `- ${i.qty} ${i.unit} ${i.name}`)
    .join('\n');

  const message = `Time to cook! Tonight: ${meal.recipe_name} (${meal.cook_time_min} min)\n\nIngredients:\n${ingredientsList}\n\nSteps:\n${meal.recipe_steps || 'Recipe steps not available.'}\n\nNeed to adjust anything? Or reply "skip" to skip tonight.`;

  setConversationState(phoneNumber, ConversationState.AWAITING_COOK_FEEDBACK, {
    planned_meal_id: meal.id,
  });

  await sendTextMessage(phoneNumber, message, true);
}

export async function triggerPostCookCheckin(phoneNumber: string): Promise<void> {
  const user = getOrCreateUser(phoneNumber);

  // Only check in if we're still waiting for cook feedback
  if (user.conversation_state !== ConversationState.AWAITING_COOK_FEEDBACK) {
    return;
  }

  const mealId = user.state_context.planned_meal_id as string;
  const plan = getCurrentPlan(phoneNumber);
  const meal = plan?.meals.find(m => m.id === mealId);

  if (!meal) return;

  await sendTextMessage(
    phoneNumber,
    `How did the ${meal.recipe_name} turn out? Rate 1-5 or tell me what you'd change!`,
    true,
  );
}
