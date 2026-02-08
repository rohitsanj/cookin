import type { User } from '../../services/user.js';
import { setConversationState } from '../../services/user.js';
import { getInventory } from '../../services/inventory.js';
import { ConversationState } from '../state.js';
import { getLlm } from '../../llm/adapter.js';
import { buildSystemPrompt, buildMealPlanPrompt, buildGroceryListPrompt } from '../prompt-builder.js';
import { parseResponse } from '../response-parser.js';
import * as mealPlanService from '../../services/meal-plan.js';

export async function generateAndSendMealPlan(user: User): Promise<string> {
  const systemPrompt = buildMealPlanPrompt(user);
  const response = await getLlm().chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Generate my meal plan for this week.' },
  ]);

  const parsed = parseResponse(response.content);
  const meals = (parsed.data?.meals as Array<{
    day: string;
    recipe_name: string;
    recipe_steps: string;
    ingredients: Array<{ name: string; qty: string; unit: string }>;
    cook_time_min: number;
  }>) || [];

  if (meals.length === 0) {
    return parsed.reply || "I had trouble generating a meal plan. Could you try asking again?";
  }

  // Get the start of the current week (Monday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const weekStart = monday.toISOString().split('T')[0];

  // Create meal plan in DB
  const planId = mealPlanService.createMealPlan(user.phone_number, weekStart);

  for (const meal of meals) {
    mealPlanService.addPlannedMeal(planId, {
      day: meal.day,
      recipe_name: meal.recipe_name,
      recipe_steps: meal.recipe_steps,
      ingredients: meal.ingredients,
      cook_time_min: meal.cook_time_min,
    });
  }

  // Store pending plan in state context for negotiation
  setConversationState(user.phone_number, ConversationState.AWAITING_MEAL_PLAN_APPROVAL, {
    plan_id: planId,
    pending_plan: { meals: meals.map(m => ({ day: m.day, recipe_name: m.recipe_name, cook_time_min: m.cook_time_min })) },
  });

  return parsed.reply;
}

export async function handleMealPlanNegotiation(user: User, text: string): Promise<string> {
  const systemPrompt = buildSystemPrompt(user, ConversationState.AWAITING_MEAL_PLAN_APPROVAL, user.state_context);
  const response = await getLlm().chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ]);
  const parsed = parseResponse(response.content);
  const planId = user.state_context.plan_id as string;

  switch (parsed.intent) {
    case 'accept_plan': {
      mealPlanService.confirmPlan(planId);

      // Generate grocery list
      const plan = mealPlanService.getCurrentPlan(user.phone_number);
      if (plan) {
        const groceryReply = await generateGroceryList(user, plan);
        setConversationState(user.phone_number, ConversationState.IDLE);
        return `${parsed.reply}\n\n${groceryReply}`;
      }
      setConversationState(user.phone_number, ConversationState.IDLE);
      return parsed.reply;
    }

    case 'swap_meal': {
      const day = parsed.data?.day as string;
      const reason = parsed.data?.reason as string;

      if (!day) {
        return parsed.reply || "Which day's meal do you want to swap?";
      }

      // Remove the old meal for that day
      const plan = mealPlanService.getCurrentPlan(user.phone_number);
      if (plan) {
        const mealToRemove = plan.meals.find(m => m.day === day);
        if (mealToRemove) {
          mealPlanService.removePlannedMeal(mealToRemove.id);
        }
      }

      // Ask LLM for a replacement
      const swapPrompt = buildMealPlanPrompt(user);
      const swapResponse = await getLlm().chat([
        { role: 'system', content: swapPrompt },
        { role: 'user', content: `Generate a single replacement meal for ${day}. ${reason ? `Preference: ${reason}` : ''}. Different from: ${plan?.meals.filter(m => m.day !== day).map(m => m.recipe_name).join(', ')}` },
      ]);
      const swapParsed = parseResponse(swapResponse.content);
      const newMeals = (swapParsed.data?.meals as Array<{
        day: string;
        recipe_name: string;
        recipe_steps: string;
        ingredients: Array<{ name: string; qty: string; unit: string }>;
        cook_time_min: number;
      }>) || [];

      if (newMeals.length > 0) {
        mealPlanService.addPlannedMeal(planId, {
          day,
          recipe_name: newMeals[0].recipe_name,
          recipe_steps: newMeals[0].recipe_steps,
          ingredients: newMeals[0].ingredients,
          cook_time_min: newMeals[0].cook_time_min,
        });
      }

      // Rebuild the plan view
      const updatedPlan = mealPlanService.getCurrentPlan(user.phone_number);
      const planText = updatedPlan?.meals
        .map(m => `${m.day} — ${m.recipe_name} (${m.cook_time_min} min)`)
        .join('\n') || '';

      setConversationState(user.phone_number, ConversationState.AWAITING_MEAL_PLAN_APPROVAL, {
        plan_id: planId,
        pending_plan: { meals: updatedPlan?.meals.map(m => ({ day: m.day, recipe_name: m.recipe_name, cook_time_min: m.cook_time_min })) },
      });

      return `Swapped ${day}! Here's the updated plan:\n\n${planText}\n\nAnything else to change?`;
    }

    case 'reject_plan': {
      // Clear all meals and regenerate
      mealPlanService.clearPlanMeals(planId);
      const newReply = await generateAndSendMealPlan(user);
      return newReply;
    }

    case 'skip_day': {
      const day = parsed.data?.day as string;
      if (day) {
        const plan = mealPlanService.getCurrentPlan(user.phone_number);
        const mealToSkip = plan?.meals.find(m => m.day === day);
        if (mealToSkip) {
          mealPlanService.updateMealStatus(mealToSkip.id, 'skipped');
        }
      }
      return parsed.reply || `Skipping ${parsed.data?.day || 'that day'} this week.`;
    }

    default:
      return parsed.reply;
  }
}

async function generateGroceryList(user: User, plan: mealPlanService.MealPlan): Promise<string> {
  const inventory = getInventory(user.phone_number);
  const meals = plan.meals
    .filter(m => m.status === 'pending')
    .map(m => ({
      recipe_name: m.recipe_name,
      ingredients: m.ingredients,
    }));

  const prompt = buildGroceryListPrompt(
    user,
    meals,
    inventory.map(i => ({ item_name: i.item_name, quantity: i.quantity })),
  );

  const response = await getLlm().chat([
    { role: 'system', content: prompt },
    { role: 'user', content: 'Generate my grocery list.' },
  ]);
  const parsed = parseResponse(response.content);

  // Save grocery list to DB
  const items = (parsed.data?.items as mealPlanService.GroceryList['items']) || [];
  mealPlanService.createGroceryList(plan.id, items);

  return parsed.reply || 'Could not generate grocery list.';
}
