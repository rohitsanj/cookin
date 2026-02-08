import type { User } from '../../services/user.js';
import { setConversationState } from '../../services/user.js';
import { ConversationState } from '../state.js';
import { getLlm } from '../../llm/adapter.js';
import { buildSystemPrompt, buildMealPlanPrompt, buildGroceryListPrompt } from '../prompt-builder.js';
import { parseResponse } from '../response-parser.js';
import * as mealPlanService from '../../services/meal-plan.js';

interface MealData {
  day: string;
  meal_type?: 'breakfast' | 'lunch' | 'dinner';
  recipe_name: string;
  recipe_steps: string;
  ingredients: Array<{ name: string; qty: string; unit: string }>;
  cook_time_min: number;
}

export async function generateAndSendMealPlan(user: User): Promise<string> {
  const systemPrompt = buildMealPlanPrompt(user);
  const response = await getLlm().chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Generate my meal plan for this week.' },
  ]);

  const parsed = parseResponse(response.content);
  const meals = (parsed.data?.meals as MealData[]) || [];

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
      meal_type: meal.meal_type || 'dinner',
      recipe_name: meal.recipe_name,
      recipe_steps: meal.recipe_steps,
      ingredients: meal.ingredients,
      cook_time_min: meal.cook_time_min,
    });
  }

  // Store pending plan in state context for negotiation
  setConversationState(user.phone_number, ConversationState.AWAITING_MEAL_PLAN_APPROVAL, {
    plan_id: planId,
    pending_plan: {
      meals: meals.map(m => ({
        day: m.day,
        meal_type: m.meal_type || 'dinner',
        recipe_name: m.recipe_name,
        cook_time_min: m.cook_time_min,
      })),
    },
  });

  return parsed.reply;
}

function formatPlanText(plan: mealPlanService.MealPlan): string {
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const typeOrder = { breakfast: 0, lunch: 1, dinner: 2 };
  const typeIcon: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' };

  const byDay = new Map<string, mealPlanService.PlannedMeal[]>();
  for (const m of plan.meals) {
    const list = byDay.get(m.day) || [];
    list.push(m);
    byDay.set(m.day, list);
  }

  const lines: string[] = [];
  for (const day of dayOrder) {
    const meals = byDay.get(day);
    if (!meals) continue;
    lines.push(day);
    meals
      .sort((a, b) => (typeOrder[a.meal_type] ?? 3) - (typeOrder[b.meal_type] ?? 3))
      .forEach(m => {
        const icon = typeIcon[m.meal_type] || '🍽️';
        lines.push(`  ${icon} ${m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1)} — ${m.recipe_name} (${m.cook_time_min} min)`);
      });
    lines.push('');
  }
  return lines.join('\n').trim();
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
      const days = parsed.data?.days as string[] | undefined;
      const day = parsed.data?.day as string | undefined;
      const mealType = parsed.data?.meal_type as string | undefined;
      const reason = parsed.data?.reason as string || '';

      // Support both single day and multiple days
      const daysToSwap = days || (day ? [day] : []);

      if (daysToSwap.length === 0) {
        return parsed.reply || "Which day's meal do you want to swap?";
      }

      const plan = mealPlanService.getCurrentPlan(user.phone_number);

      for (const swapDay of daysToSwap) {
        if (!plan) break;

        // Find meals to remove for this day
        const mealsToRemove = plan.meals.filter(m => {
          if (m.day !== swapDay) return false;
          if (mealType && m.meal_type !== mealType) return false;
          return true;
        });

        for (const meal of mealsToRemove) {
          mealPlanService.removePlannedMeal(meal.id);
        }

        // Determine what to regenerate
        const typesToRegenerate = mealType ? [mealType] : ['breakfast', 'lunch', 'dinner'];
        const existingNames = plan.meals
          .filter(m => m.day !== swapDay)
          .map(m => m.recipe_name);

        // Ask LLM for replacements
        const swapPrompt = buildMealPlanPrompt(user);
        try {
          const swapResponse = await getLlm().chat([
            { role: 'system', content: swapPrompt },
            {
              role: 'user',
              content: `Generate replacement meals for ${swapDay}: ${typesToRegenerate.join(', ')}. ${reason ? `Preference: ${reason}.` : ''} Must be different from: ${existingNames.join(', ')}`,
            },
          ]);
          const swapParsed = parseResponse(swapResponse.content);
          const newMeals = (swapParsed.data?.meals as MealData[]) || [];

          for (const newMeal of newMeals) {
            mealPlanService.addPlannedMeal(planId, {
              day: swapDay,
              meal_type: newMeal.meal_type || 'dinner',
              recipe_name: newMeal.recipe_name,
              recipe_steps: newMeal.recipe_steps,
              ingredients: newMeal.ingredients,
              cook_time_min: newMeal.cook_time_min,
            });
          }
        } catch (err) {
          console.error(`Error generating swap for ${swapDay}:`, err);
        }
      }

      // Rebuild the plan view
      const updatedPlan = mealPlanService.getCurrentPlan(user.phone_number);
      const planText = updatedPlan ? formatPlanText(updatedPlan) : '';

      setConversationState(user.phone_number, ConversationState.AWAITING_MEAL_PLAN_APPROVAL, {
        plan_id: planId,
        pending_plan: {
          meals: updatedPlan?.meals.map(m => ({
            day: m.day,
            meal_type: m.meal_type,
            recipe_name: m.recipe_name,
            cook_time_min: m.cook_time_min,
          })),
        },
      });

      return `Here's the updated plan:\n\n${planText}\n\nWant to swap anything else, or does this look good?`;
    }

    case 'reject_plan': {
      mealPlanService.clearPlanMeals(planId);
      // Delete the plan and regenerate from scratch
      const newReply = await generateAndSendMealPlan(user);
      return newReply;
    }

    case 'skip_day': {
      const day = parsed.data?.day as string;
      if (day) {
        const plan = mealPlanService.getCurrentPlan(user.phone_number);
        const mealsToSkip = plan?.meals.filter(m => m.day === day) || [];
        for (const meal of mealsToSkip) {
          mealPlanService.updateMealStatus(meal.id, 'skipped');
        }
      }
      return parsed.reply || `Skipping ${parsed.data?.day || 'that day'} this week.`;
    }

    default:
      return parsed.reply;
  }
}

async function generateGroceryList(user: User, plan: mealPlanService.MealPlan): Promise<string> {
  const meals = plan.meals
    .filter(m => m.status === 'pending')
    .map(m => ({
      recipe_name: m.recipe_name,
      ingredients: m.ingredients,
    }));

  const prompt = buildGroceryListPrompt(user, meals);

  const response = await getLlm().chat([
    { role: 'system', content: prompt },
    { role: 'user', content: 'Generate my grocery list.' },
  ]);
  const parsed = parseResponse(response.content);

  const items = (parsed.data?.items as mealPlanService.GroceryList['items']) || [];
  mealPlanService.createGroceryList(plan.id, items);

  return parsed.reply || 'Could not generate grocery list.';
}
