import { getOrCreateUser } from '../services/user.js';
import { logMessage } from '../services/message-throttle.js';
import { sendTextMessage } from '../sender/sender.js';
import { ConversationState, isOnboardingState } from './state.js';
import { handleOnboarding } from './flows/onboarding.js';
import { handleInventoryConfirmation } from './flows/inventory-confirmation.js';
import { handleMealPlanNegotiation } from './flows/meal-plan-negotiation.js';
import { handleCookFeedback } from './flows/cook-reminder.js';
import { handleGroceryConfirmation } from './flows/grocery-confirmation.js';
import { handleAdHoc } from './flows/ad-hoc.js';

export async function handleInbound(from: string, text: string): Promise<void> {
  // First get or create the user
  const user = getOrCreateUser(from);
  // Then log the inbound message
  logMessage(from, 'inbound', text);
  let responseText: string;

  try {
    if (isOnboardingState(user.conversation_state)) {
      responseText = await handleOnboarding(user, text);
    } else {
      switch (user.conversation_state) {
        case ConversationState.AWAITING_INVENTORY_CONFIRM:
          responseText = await handleInventoryConfirmation(user, text);
          break;
        case ConversationState.AWAITING_MEAL_PLAN_APPROVAL:
          responseText = await handleMealPlanNegotiation(user, text);
          break;
        case ConversationState.AWAITING_COOK_FEEDBACK:
          responseText = await handleCookFeedback(user, text);
          break;
        case ConversationState.AWAITING_GROCERY_CONFIRM:
          responseText = await handleGroceryConfirmation(user, text);
          break;
        case ConversationState.IDLE:
        default:
          responseText = await handleAdHoc(user, text);
          break;
      }
    }
  } catch (err) {
    console.error(`Error processing message from ${from}:`, err);
    responseText = "Sorry, I had a hiccup processing that. Could you try again?";
  }

  await sendTextMessage(from, responseText);
}
