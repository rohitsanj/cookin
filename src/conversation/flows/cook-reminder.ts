import type { User } from '../../services/user.js';
import { setConversationState } from '../../services/user.js';
import { ConversationState } from '../state.js';
import { getLlm } from '../../llm/adapter.js';
import { buildSystemPrompt } from '../prompt-builder.js';
import { parseResponse } from '../response-parser.js';
import * as mealPlanService from '../../services/meal-plan.js';
import * as recipeService from '../../services/recipe.js';

export async function handleCookFeedback(user: User, text: string): Promise<string> {
  const mealId = user.state_context.planned_meal_id as string;
  const systemPrompt = buildSystemPrompt(user, ConversationState.AWAITING_COOK_FEEDBACK, user.state_context);

  const response = await getLlm().chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ]);
  const parsed = parseResponse(response.content);

  if (parsed.intent === 'cook_skipped') {
    if (mealId) {
      mealPlanService.updateMealStatus(mealId, 'skipped');
    }
    setConversationState(user.phone_number, ConversationState.IDLE);
    return parsed.reply || "No worries, there's always next time!";
  }

  // Cook feedback
  const rating = parsed.data?.rating as number | undefined;
  const notes = parsed.data?.notes as string | undefined;
  const wantToSave = parsed.data?.want_to_save as boolean | undefined;

  if (mealId) {
    mealPlanService.updateMealStatus(mealId, 'cooked', rating);

    // If they want to save the recipe
    if (wantToSave && rating && rating >= 3) {
      const plan = mealPlanService.getCurrentPlan(user.phone_number);
      const meal = plan?.meals.find(m => m.id === mealId);

      if (meal) {
        const existing = recipeService.findRecipeByName(user.phone_number, meal.recipe_name);
        if (existing) {
          // Update existing
          if (rating) recipeService.updateRecipeRating(existing.id, rating, notes);
          recipeService.incrementTimesCooked(existing.id);
        } else {
          // Save new recipe
          recipeService.saveRecipe(user.phone_number, {
            recipe_name: meal.recipe_name,
            original_recipe_steps: meal.recipe_steps || '',
            modified_recipe_steps: notes ? `${meal.recipe_steps}\n\nUser modifications: ${notes}` : undefined,
            ingredients: meal.ingredients,
            cook_time_min: meal.cook_time_min ?? undefined,
            user_rating: rating,
            notes,
          });
        }
      }
    }
  }

  setConversationState(user.phone_number, ConversationState.IDLE);
  return parsed.reply || "Thanks for the feedback!";
}
