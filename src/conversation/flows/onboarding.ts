import type { User } from '../../services/user.js';
import { updateUser, setConversationState, getOrCreateUser } from '../../services/user.js';
import { addItems } from '../../services/inventory.js';
import { ConversationState } from '../state.js';
import { getLlm } from '../../llm/adapter.js';
import { buildSystemPrompt } from '../prompt-builder.js';
import { parseResponse } from '../response-parser.js';
import { scheduleUserJobs } from '../../scheduler/index.js';

async function llmParse(user: User, state: ConversationState, text: string): Promise<Record<string, unknown>> {
  const systemPrompt = buildSystemPrompt(user, state, {});
  const response = await getLlm().chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ]);
  const parsed = parseResponse(response.content);
  return parsed.data ?? {};
}

export async function handleOnboarding(user: User, text: string): Promise<string> {
  switch (user.conversation_state) {
    case ConversationState.NEW: {
      setConversationState(user.phone_number, ConversationState.ONBOARDING_CUISINE);
      return `Hey there! Welcome to Cookin 🍳

I'll help you build a cooking habit by planning meals, sending you grocery lists, and reminding you when it's time to cook.

Let's set you up! What cuisines do you enjoy? (e.g., Indian, Italian, Mexican, Japanese — list as many as you like)`;
    }

    case ConversationState.ONBOARDING_CUISINE: {
      const data = await llmParse(user, ConversationState.ONBOARDING_CUISINE, text);
      const cuisines = (data.cuisines as string[]) || [text];
      updateUser(user.phone_number, { cuisine_preferences: cuisines });
      setConversationState(user.phone_number, ConversationState.ONBOARDING_DIETARY);
      return `Great taste! ${cuisines.join(', ')} it is.

Any dietary restrictions or allergies? (e.g., vegetarian, no shellfish, lactose intolerant — or just say "none")`;
    }

    case ConversationState.ONBOARDING_DIETARY: {
      const data = await llmParse(user, ConversationState.ONBOARDING_DIETARY, text);
      const restrictions = (data.dietary_restrictions as string[]) || [];
      updateUser(user.phone_number, { dietary_restrictions: restrictions });
      setConversationState(user.phone_number, ConversationState.ONBOARDING_HOUSEHOLD);
      const note = restrictions.length > 0
        ? `Noted: ${restrictions.join(', ')}.`
        : `No restrictions — that makes things easy!`;
      return `${note}

How many people are you usually cooking for?`;
    }

    case ConversationState.ONBOARDING_HOUSEHOLD: {
      const data = await llmParse(user, ConversationState.ONBOARDING_HOUSEHOLD, text);
      const size = (data.household_size as number) || 1;
      updateUser(user.phone_number, { household_size: size });
      setConversationState(user.phone_number, ConversationState.ONBOARDING_SKILL);
      return `Cooking for ${size}. Got it!

How would you rate your cooking skills?
- Beginner (just starting out)
- Intermediate (comfortable with most recipes)
- Advanced (bring on the challenges)`;
    }

    case ConversationState.ONBOARDING_SKILL: {
      const data = await llmParse(user, ConversationState.ONBOARDING_SKILL, text);
      const skill = (data.skill_level as string) || 'beginner';
      updateUser(user.phone_number, { skill_level: skill as User['skill_level'] });
      setConversationState(user.phone_number, ConversationState.ONBOARDING_COOK_DAYS);
      return `${skill.charAt(0).toUpperCase() + skill.slice(1)} — I'll tailor the recipes accordingly.

Which days of the week do you want to cook? (e.g., Mon, Wed, Fri, Sun)`;
    }

    case ConversationState.ONBOARDING_COOK_DAYS: {
      const data = await llmParse(user, ConversationState.ONBOARDING_COOK_DAYS, text);
      const days = (data.cook_days as string[]) || [];
      updateUser(user.phone_number, { cook_days: days });
      setConversationState(user.phone_number, ConversationState.ONBOARDING_GROCERY_DAY);
      return `You'll cook on ${days.join(', ')}. Nice!

Which day do you want me to send your grocery list? (Usually a day or two before your first cook day)`;
    }

    case ConversationState.ONBOARDING_GROCERY_DAY: {
      const data = await llmParse(user, ConversationState.ONBOARDING_GROCERY_DAY, text);
      const day = (data.grocery_day as string) || 'Saturday';
      updateUser(user.phone_number, { grocery_day: day });
      setConversationState(user.phone_number, ConversationState.ONBOARDING_REMINDER_TIME);
      return `Grocery list coming every ${day}.

What time should I remind you to start cooking? (e.g., 5:30 PM, 6 PM)`;
    }

    case ConversationState.ONBOARDING_REMINDER_TIME: {
      const data = await llmParse(user, ConversationState.ONBOARDING_REMINDER_TIME, text);
      const time = (data.cook_reminder_time as string) || '17:30';
      const timezone = (data.timezone as string) || 'America/Los_Angeles';
      updateUser(user.phone_number, { cook_reminder_time: time, timezone });
      setConversationState(user.phone_number, ConversationState.ONBOARDING_INVENTORY);
      return `Cook reminders at ${time}. Perfect.

Do you have any staples at home right now? (e.g., rice, pasta, olive oil, salt, basic spices — list whatever you have, or say "nothing")`;
    }

    case ConversationState.ONBOARDING_INVENTORY: {
      const data = await llmParse(user, ConversationState.ONBOARDING_INVENTORY, text);
      const items = (data.items as Array<{ item_name: string; category?: string }>) || [];
      if (items.length > 0) {
        addItems(user.phone_number, items.map(i => ({ ...i, is_staple: true })));
      }
      setConversationState(user.phone_number, ConversationState.ONBOARDING_MAX_MESSAGES);
      const itemNote = items.length > 0
        ? `Got it — ${items.length} staples logged.`
        : `Starting from scratch — no problem!`;
      return `${itemNote}

Last question: how many messages from me per day is okay? (e.g., 2-3, or say "just the essentials" for minimal messages)`;
    }

    case ConversationState.ONBOARDING_MAX_MESSAGES: {
      const data = await llmParse(user, ConversationState.ONBOARDING_MAX_MESSAGES, text);
      const maxMessages = (data.max_messages_per_day as number) || 3;
      updateUser(user.phone_number, { max_messages_per_day: maxMessages });
      setConversationState(user.phone_number, ConversationState.ONBOARDING_CONFIRM);

      const updated = getOrCreateUser(user.phone_number);
      return `Here's your profile:

Cuisines: ${updated.cuisine_preferences.join(', ')}
Restrictions: ${updated.dietary_restrictions.join(', ') || 'None'}
Household: ${updated.household_size}
Skill: ${updated.skill_level}
Cook days: ${updated.cook_days.join(', ')}
Grocery day: ${updated.grocery_day}
Reminder time: ${updated.cook_reminder_time}
Max messages/day: ${updated.max_messages_per_day}

Does everything look right? (say "yes" to confirm, or tell me what to change)`;
    }

    case ConversationState.ONBOARDING_CONFIRM: {
      const lower = text.toLowerCase().trim();
      const isConfirm = ['yes', 'yeah', 'yep', 'y', 'looks good', 'correct', 'confirm', 'perfect', 'lgtm', 'good'].some(
        w => lower.includes(w)
      );

      if (isConfirm) {
        setConversationState(user.phone_number, ConversationState.IDLE);
        const updated = getOrCreateUser(user.phone_number);
        scheduleUserJobs(updated);
        return `You're all set!

I'll send your inventory check and meal plan on ${updated.grocery_day}, and cooking reminders on ${updated.cook_days.join(', ')} at ${updated.cook_reminder_time}.

You can message me anytime to:
- Update what's in your kitchen
- Change your preferences or schedule
- Ask for recipe ideas
- View your meal plan

Talk soon!`;
      } else {
        // Use LLM to figure out what they want to change
        const data = await llmParse(user, ConversationState.ONBOARDING_CONFIRM, text);
        const field = data.field as string | undefined;
        const value = data.value;

        if (field && value !== undefined) {
          updateUser(user.phone_number, { [field]: value } as Record<string, unknown>);
          const updated = getOrCreateUser(user.phone_number);
          return `Updated! Here's your revised profile:

Cuisines: ${updated.cuisine_preferences.join(', ')}
Restrictions: ${updated.dietary_restrictions.join(', ') || 'None'}
Household: ${updated.household_size}
Skill: ${updated.skill_level}
Cook days: ${updated.cook_days.join(', ')}
Grocery day: ${updated.grocery_day}
Reminder time: ${updated.cook_reminder_time}
Max messages/day: ${updated.max_messages_per_day}

Does everything look right now?`;
        }

        return `I'm not sure what you'd like to change. Could you be more specific? (e.g., "change cook days to Mon and Thu" or "make it vegetarian")`;
      }
    }

    default:
      return "Something went wrong with the setup. Let's start over — what cuisines do you enjoy?";
  }
}
