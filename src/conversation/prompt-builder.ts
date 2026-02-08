import type { User } from '../services/user.js';
import { getInventory } from '../services/inventory.js';
import { getSavedRecipes } from '../services/recipe.js';
import { getCurrentPlan } from '../services/meal-plan.js';
import { ConversationState } from './state.js';

const PERSONA = `You are Cookin, a friendly and practical cooking assistant on WhatsApp. You help the user build a consistent cooking habit through meal planning, grocery lists, and cooking reminders.

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

    case ConversationState.ONBOARDING_GROCERY_DAY:
      return `The user is answering: "Which day do you want your grocery list?"
Parse into a single day name.
Intent: "onboarding_response"
Data: { "grocery_day": "Saturday" }`;

    case ConversationState.ONBOARDING_REMINDER_TIME:
      return `The user is answering: "What time should I remind you to start cooking?"
Parse into 24h format HH:MM. Also try to infer their timezone from any context clues, otherwise default to "America/Los_Angeles".
Intent: "onboarding_response"
Data: { "cook_reminder_time": "17:30", "timezone": "America/Los_Angeles" }`;

    case ConversationState.ONBOARDING_INVENTORY:
      return `The user is listing staples they have at home.
Parse into a list of items with optional category. Mark all as staples.
Intent: "onboarding_response"
Data: { "items": [{ "item_name": "rice", "category": "pantry" }, { "item_name": "olive oil", "category": "pantry" }, ...] }`;

    case ConversationState.ONBOARDING_MAX_MESSAGES:
      return `The user is answering: "How many messages from me per day is okay?"
Parse into a number (default 3 if unclear).
Intent: "onboarding_response"
Data: { "max_messages_per_day": 3 }`;

    case ConversationState.ONBOARDING_CONFIRM:
      return `The user was just shown their profile summary and asked to confirm.
Determine if they're confirming (yes/looks good/correct) or want to change something.
If confirming: intent "confirm_profile", reply with a welcome message.
If changing: intent "correct_profile", data = { "field": "<which field>", "value": "<new value>" }, and your reply should acknowledge the change and re-confirm.`;

    case ConversationState.AWAITING_INVENTORY_CONFIRM: {
      const checklist = stateContext.inventory_checklist as number[] | undefined;
      return `The user was sent a numbered inventory checklist and asked to reply with numbers of items they still have.
The checklist item IDs are: ${JSON.stringify(checklist || [])}
Parse their response. They might say:
- A list of numbers: "1,2,3,5" or "1 2 3 5"
- "all" — they have everything
- "none" — they have nothing
- Natural language: "I have everything except the spinach"

Intent: "inventory_confirm"
Data: { "keep_indices": [0, 1, 2, 4] } — zero-based indices of items to KEEP
If "all": keep_indices should include all indices.
If "none": keep_indices should be empty array.`;
    }

    case ConversationState.AWAITING_MEAL_PLAN_APPROVAL: {
      const pendingPlan = stateContext.pending_plan as Record<string, unknown> | undefined;
      return `The user was sent a proposed meal plan and asked if they want to swap anything.
Pending plan: ${JSON.stringify(pendingPlan || {})}

Possible intents:
- "accept_plan" — they approve (e.g. "looks good", "yes", "perfect")
- "swap_meal" — they want to swap a specific meal. Data: { "day": "Monday", "reason": "something quicker" }
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

    case ConversationState.AWAITING_GROCERY_CONFIRM:
      return `The user was asked if they got everything on the grocery list.
Parse what they bought.

Intent: "grocery_confirm"
Data: {
  "got_everything": true/false,
  "bought_items": [{ "item_name": "chicken", "quantity": "500g" }, ...],
  "missing_items": ["cream"]
}`;

    case ConversationState.IDLE:
      return `The user is sending a free-form message. Classify their intent:

Possible intents:
- "update_inventory" — they're telling you what they bought or ran out of.
  Data: { "add": [{ "item_name": "eggs", "quantity": "12", "category": "protein" }], "remove": ["milk"] }
- "change_preferences" — updating cuisine preferences, dietary restrictions, etc.
  Data: { "field": "cuisine_preferences", "value": ["Indian", "Japanese"] }
- "adjust_schedule" — changing cook days, grocery day, reminder time, etc.
  Data: { "field": "cook_days", "value": ["Monday", "Thursday"] }
- "adjust_frequency" — changing message frequency.
  Data: { "max_messages_per_day": 5 }
- "ask_recipe" — asking what they can make or for a specific recipe.
  Data: { "constraints": "quick", "cuisine": "Italian" }
- "log_meal" — they cooked something (not from the plan).
  Data: { "recipe_name": "pasta", "ingredients_used": ["pasta", "garlic", "olive oil"] }
- "view_plan" — asking about this week's meal plan.
- "rate_recipe" — rating a recipe they cooked.
  Data: { "recipe_name": "...", "rating": 4, "notes": "..." }
- "save_recipe" — explicitly asking to save a recipe.
  Data: { "recipe_name": "..." }
- "modify_recipe" — changing a saved recipe.
  Data: { "recipe_name": "...", "modification": "use yogurt instead of cream" }
- "browse_recipes" — viewing their saved recipes.
  Data: { "filter": "Indian" }
- "general_question" — general cooking questions.
- "greeting" — just saying hi.
- "other" — anything else.`;

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
Grocery day: ${user.grocery_day || 'Not set'} at ${user.grocery_time}
Cook reminder time: ${user.cook_reminder_time}
Timezone: ${user.timezone}`);
  }

  // Inventory context for relevant states
  if ([ConversationState.IDLE, ConversationState.AWAITING_MEAL_PLAN_APPROVAL].includes(state)) {
    const inventory = getInventory(user.phone_number);
    if (inventory.length > 0) {
      const inventoryText = inventory.map(item => {
        let line = `- ${item.item_name}`;
        if (item.quantity) line += ` (${item.quantity})`;
        if (item.is_staple) line += ' [staple]';
        return line;
      }).join('\n');
      parts.push(`## Current Kitchen Inventory\n${inventoryText}`);
    }
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

  parts.push(RESPONSE_FORMAT);

  return parts.join('\n\n---\n\n');
}

export function buildMealPlanPrompt(user: User): string {
  const parts: string[] = [PERSONA];

  parts.push(`## Task: Generate a Weekly Meal Plan

Generate a meal plan for the following cook days: ${user.cook_days.join(', ')}

Requirements:
- Cuisine preferences: ${user.cuisine_preferences.join(', ') || 'any'}
- Dietary restrictions: ${user.dietary_restrictions.join(', ') || 'none'}
- Household size: ${user.household_size} servings
- Skill level: ${user.skill_level}
- No repeats within the week
- Include variety across cuisines
- Each meal should be achievable for a ${user.skill_level} cook`);

  const inventory = getInventory(user.phone_number);
  if (inventory.length > 0) {
    const inventoryText = inventory.map(item => {
      let line = item.item_name;
      if (item.quantity) line += ` (${item.quantity})`;
      return line;
    }).join(', ');
    parts.push(`## Available Ingredients\n${inventoryText}\n\nTry to incorporate these ingredients where possible to minimize grocery shopping.`);
  }

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
        "recipe_name": "Chicken tikka masala",
        "recipe_steps": "1. Marinate chicken...\\n2. Sear chicken...\\n3. Add sauce...\\n4. Serve over rice",
        "ingredients": [
          { "name": "chicken thigh", "qty": "500", "unit": "g" },
          { "name": "tikka paste", "qty": "2", "unit": "tbsp" }
        ],
        "cook_time_min": 45
      }
    ]
  }
}

The "reply" should be a nicely formatted WhatsApp message like:
"Here's your plan for this week:\\n\\nMon — Chicken tikka masala (45 min)\\nWed — Pasta aglio e olio (20 min)\\n...\\n\\nWant to swap anything?"`);

  return parts.join('\n\n---\n\n');
}

export function buildGroceryListPrompt(
  user: User,
  meals: Array<{ recipe_name: string; ingredients: Array<{ name: string; qty: string; unit: string }> }>,
  inventory: Array<{ item_name: string; quantity: string | null }>
): string {
  return `${PERSONA}

## Task: Generate a Grocery List

Based on the following meals and current inventory, generate a grocery list of items the user needs to buy.

### Planned Meals
${meals.map(m => `- ${m.recipe_name}: ${m.ingredients.map(i => `${i.qty} ${i.unit} ${i.name}`).join(', ')}`).join('\n')}

### Current Inventory
${inventory.map(i => `- ${i.item_name}${i.quantity ? ` (${i.quantity})` : ''}`).join('\n') || 'Empty'}

### Instructions
- Subtract what the user already has from what they need
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
