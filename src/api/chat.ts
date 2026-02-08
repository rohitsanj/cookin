import { getOrCreateUser } from '../services/user.js';
import { logMessage } from '../services/message-throttle.js';
import { ConversationState, isOnboardingState } from '../conversation/state.js';
import { handleOnboarding } from '../conversation/flows/onboarding.js';
import { handleMealPlanNegotiation } from '../conversation/flows/meal-plan-negotiation.js';
import { handleCookFeedback } from '../conversation/flows/cook-reminder.js';
import { handleAdHoc } from '../conversation/flows/ad-hoc.js';

/**
 * Handles a web chat message and returns the response text directly.
 */
export async function handleWebChat(userIdentifier: string, text: string): Promise<string> {
  // Get or create user with the web-based identifier
  const user = getOrCreateUser(userIdentifier);

  // Log inbound message
  logMessage(userIdentifier, 'inbound', text);

  let responseText: string;

  try {
    if (isOnboardingState(user.conversation_state)) {
      responseText = await handleOnboarding(user, text);
    } else {
      switch (user.conversation_state) {
        case ConversationState.AWAITING_MEAL_PLAN_APPROVAL:
          responseText = await handleMealPlanNegotiation(user, text);
          break;
        case ConversationState.AWAITING_COOK_FEEDBACK:
          responseText = await handleCookFeedback(user, text);
          break;
        case ConversationState.IDLE:
        default:
          responseText = await handleAdHoc(user, text);
          break;
      }
    }
  } catch (err) {
    console.error(`Error processing web message from ${userIdentifier}:`, err);
    responseText = "Sorry, I had a hiccup processing that. Could you try again?";
  }

  // Log outbound message
  logMessage(userIdentifier, 'outbound', responseText);

  return responseText;
}
