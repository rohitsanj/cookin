import type { User } from '../services/user.js';
import { getSavedRecipes } from '../services/recipe.js';
import { getCurrentPlan } from '../services/meal-plan.js';
import { ConversationState } from './state.js';
import { DB_SCHEMA_CONTEXT } from '../tools/schema-context.js';

const PERSONA = `You are Cookin, a friendly and practical cooking assistant. You help the user build a consistent cooking habit through meal planning and personalized recipes.

Your personality:
- Warm but concise (WhatsApp messages should be short — no walls of text)
- Practical, not preachy
- Encouraging without being cheesy
- You use simple language, not chef jargon`;

const RESPONSE_FORMAT = `IMPORTANT: You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no extra text). The JSON must have this structure:
{
  "intent": "<string — the classified intent>",
  "reply": "<string — your WhatsApp message to the user>",
  "data": { <optional structured data depending on intent> }
}`;

function getStateInstructions(state: ConversationState, stateContext: Record<string, unknown>): string {
  switch (state) {
    case ConversationState.ONBOARDING_CUISINE:
      return `The user is answering: "What cuisines do you enjoy?"
Parse their response into a list of cuisines.
Intent: "onboarding_response"
Data: { "cuisines": ["Indian", "Italian", ...] }`;

    case ConversationState.ONBOARDING_DIETARY:
      return `The user is answering: "Any dietary restrictions or allergies?"
Parse their response into a list of restrictions, or empty array if none.
Intent: "onboarding_response"
Data: { "dietary_restrictions": ["vegetarian", ...] }`;

    case ConversationState.ONBOARDING_HOUSEHOLD:
      return `The user is answering: "How many people are you cooking for?"
Parse their response into a number.
Intent: "onboarding_response"
Data: { "household_size": 2 }`;

    case ConversationState.ONBOARDING_SKILL:
      return `The user is answering: "How would you rate your cooking skills?"
Classify as one of: beginner, intermediate, advanced.
Intent: "onboarding_response"
Data: { "skill_level": "intermediate" }`;

    case ConversationState.ONBOARDING_COOK_DAYS:
      return `The user is answering: "Which days of the week do you want to cook?"
Parse into an array of full day names (Monday, Tuesday, etc.).
Intent: "onboarding_response"
Data: { "cook_days": ["Monday", "Wednesday", "Friday"] }`;

    case ConversationState.ONBOARDING_CONFIRM:
      return `The user was just shown their profile summary and asked to confirm.
Determine if they're confirming (yes/looks good/correct) or want to change something.
If confirming: intent "confirm_profile", reply with a welcome message.
If changing: intent "correct_profile", data = { "field": "<which field>", "value": "<new value>" }, and your reply should acknowledge the change and re-confirm.`;

    case ConversationState.AWAITING_MEAL_PLAN_APPROVAL: {
      const pendingPlan = stateContext.pending_plan as Record<string, unknown> | undefined;
      return `The user was sent a proposed meal plan (breakfast/lunch/dinner per cook day) and asked if they want to swap anything.
Pending plan: ${JSON.stringify(pendingPlan || {})}

Possible intents:
- "accept_plan" — they approve (e.g. "looks good", "yes", "perfect")
- "swap_meal" — they want to swap meals. Data: { "days": ["Monday", "Friday"], "meal_type": "dinner" (optional — omit to swap all meals for that day), "reason": "something quicker" }. Use "days" array even for a single day.
- "reject_plan" — they want entirely new options (e.g. "give me new options", "try again")
- "skip_day" — they want to skip a day this week. Data: { "day": "Friday" }`;
    }

    case ConversationState.AWAITING_COOK_FEEDBACK: {
      const mealId = stateContext.planned_meal_id as string | undefined;
      return `The user was asked "How did it go?" after cooking. The planned meal ID is: ${mealId}
Parse their response for a rating (1-5) and any notes/modifications.

Intent: "cook_feedback"
Data: {
  "rating": 4,
  "notes": "Used yogurt instead of cream",
  "want_to_save": true/false (infer from their enthusiasm — if rating >= 4 or they say "save this", true)
}

If they didn't cook or skipped: intent "cook_skipped"`;
    }

    case ConversationState.IDLE:
      return `The user is sending a free-form message. You have tools available to take actions on their behalf.

Use the appropriate tool when the user wants to:
- View, rate, save, or modify recipes
- View their current meal plan
- Update their cooking preferences or schedule
- Log a meal they cooked

For general cooking questions, greetings, or casual conversation, respond directly without using tools.
Always respond in a friendly, concise way suitable for chat.`;

    default:
      return `Interpret the user's message and respond helpfully. Intent: "other"`;
  }
}

export function buildSystemPrompt(user: User, state: ConversationState, stateContext: Record<string, unknown>): string {
  const parts: string[] = [PERSONA];

  // State-specific instructions
  parts.push('## Current Task\n' + getStateInstructions(state, stateContext));

  // User profile (if past onboarding)
  if (state !== ConversationState.NEW) {
    parts.push(`## User Profile
Name: ${user.name || 'Unknown'}
Cuisines: ${user.cuisine_preferences.join(', ') || 'Not set'}
Dietary restrictions: ${user.dietary_restrictions.join(', ') || 'None'}
Household size: ${user.household_size}
Skill level: ${user.skill_level}
Cook days: ${user.cook_days.join(', ') || 'Not set'}
Timezone: ${user.timezone}`);
  }

  // Current meal plan for relevant states
  if ([ConversationState.IDLE, ConversationState.AWAITING_COOK_FEEDBACK].includes(state)) {
    const plan = getCurrentPlan(user.phone_number);
    if (plan) {
      const planText = plan.meals.map(m =>
        `- ${m.day}: ${m.recipe_name} (${m.cook_time_min} min) — ${m.status}${m.user_rating ? `, rated ${m.user_rating}/5` : ''}`
      ).join('\n');
      parts.push(`## This Week's Meal Plan (${plan.status})\n${planText}`);
    }
  }

  // Saved recipes summary for relevant states
  if ([ConversationState.IDLE, ConversationState.AWAITING_MEAL_PLAN_APPROVAL].includes(state)) {
    const recipes = getSavedRecipes(user.phone_number);
    if (recipes.length > 0) {
      const recipesText = recipes.slice(0, 10).map(r =>
        `- ${r.recipe_name} (${r.cuisine || 'unknown'}, ${r.cook_time_min} min, rating: ${r.user_rating ?? 'unrated'}, cooked ${r.times_cooked}x)`
      ).join('\n');
      parts.push(`## Saved Recipes (${recipes.length} total)\n${recipesText}`);
    }
  }

  if (state === ConversationState.IDLE) {
    // IDLE state uses tool calling, not JSON response format
    parts.push(DB_SCHEMA_CONTEXT);
  } else {
    // Other states use structured JSON responses
    parts.push(RESPONSE_FORMAT);
  }

  return parts.join('\n\n---\n\n');
}

export function buildMealPlanPrompt(user: User): string {
  const parts: string[] = [PERSONA];

  parts.push(`## Task: Generate a Weekly Meal Plan

Generate a meal plan for the following cook days: ${user.cook_days.join(', ')}
For each cook day, generate THREE meals: breakfast, lunch, and dinner.

Requirements:
- Cuisine preferences: ${user.cuisine_preferences.join(', ') || 'any'}
- Dietary restrictions: ${user.dietary_restrictions.join(', ') || 'none'}
- Household size: ${user.household_size} servings
- Skill level: ${user.skill_level}
- No repeats within the week
- Include variety across cuisines and meal types
- Breakfasts should be quick (15-30 min)
- Lunches should be moderate (20-40 min)
- Dinners can be more involved (30-60 min)
- Each meal should be achievable for a ${user.skill_level} cook`);

  const recipes = getSavedRecipes(user.phone_number);
  if (recipes.length > 0) {
    const highRated = recipes.filter(r => (r.user_rating ?? 0) >= 4);
    if (highRated.length > 0) {
      const recipesText = highRated.map(r =>
        `- ${r.recipe_name} (${r.cuisine}, ${r.cook_time_min} min, rated ${r.user_rating}/5, last cooked: ${r.last_cooked || 'never'})`
      ).join('\n');
      parts.push(`## User's Favorite Recipes (consider re-suggesting 1-2 of these)\n${recipesText}`);
    }
  }

  parts.push(`## Response Format
Respond with ONLY a valid JSON object:
{
  "intent": "meal_plan",
  "reply": "<formatted meal plan message to send to the user>",
  "data": {
    "meals": [
      {
        "day": "Monday",
        "meal_type": "breakfast",
        "recipe_name": "Avocado toast with eggs",
        "recipe_steps": "1. Toast bread...\\n2. Mash avocado...\\n3. Fry eggs...",
        "ingredients": [
          { "name": "bread", "qty": "2", "unit": "slices" },
          { "name": "avocado", "qty": "1", "unit": "" }
        ],
        "cook_time_min": 15
      },
      {
        "day": "Monday",
        "meal_type": "lunch",
        "recipe_name": "...",
        ...
      },
      {
        "day": "Monday",
        "meal_type": "dinner",
        "recipe_name": "...",
        ...
      }
    ]
  }
}

Each cook day MUST have exactly 3 meals: breakfast, lunch, dinner.

The "reply" should be a nicely formatted message grouped by day like:
"Here's your plan for this week:

Monday
  🌅 Breakfast — Avocado toast (15 min)
  ☀️ Lunch — Caesar salad (20 min)
  🌙 Dinner — Chicken tikka masala (45 min)

Wednesday
  🌅 Breakfast — ...

Want to swap anything?"`);

  return parts.join('\n\n---\n\n');
}

export function buildGroceryListPrompt(
  user: User,
  meals: Array<{ recipe_name: string; ingredients: Array<{ name: string; qty: string; unit: string }> }>,
): string {
  return `${PERSONA}

## Task: Generate a Grocery List

Based on the following meals, generate a grocery list of items the user needs to buy.

### Planned Meals
${meals.map(m => `- ${m.recipe_name}: ${m.ingredients.map(i => `${i.qty} ${i.unit} ${i.name}`).join(', ')}`).join('\n')}

### Instructions
- Group items by store section: Produce, Protein, Dairy, Pantry, Spices, Other
- Combine duplicate ingredients across meals (add quantities)

Respond with ONLY a valid JSON object:
{
  "intent": "grocery_list",
  "reply": "<formatted grocery list message for WhatsApp, grouped by section>",
  "data": {
    "items": [
      { "name": "chicken thigh", "qty": "500g", "unit": "g", "section": "Protein" }
    ]
  }
}`;
}
