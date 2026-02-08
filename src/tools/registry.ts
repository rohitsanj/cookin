import type { ToolDefinition } from '../llm/types.js';
import * as recipe from '../services/recipe.js';
import * as mealPlan from '../services/meal-plan.js';
import { getUser, updateUser } from '../services/user.js';
import { generateAndSendMealPlan } from '../conversation/flows/meal-plan-negotiation.js';

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export function getToolsForUser(userPhone: string): {
  tools: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
} {
  const registered = buildToolRegistry(userPhone);
  const tools = registered.map(t => t.definition);
  const handlers = new Map(registered.map(t => [t.definition.name, t.handler]));
  return { tools, handlers };
}

function buildToolRegistry(userPhone: string): RegisteredTool[] {
  return [
    {
      definition: {
        name: 'get_saved_recipes',
        description: 'Get the user\'s saved recipes, optionally filtered by cuisine or favorites',
        parameters: {
          type: 'object',
          properties: {
            filter: { type: 'string', description: 'Optional cuisine filter' },
            favorites_only: { type: 'boolean', description: 'Only return favorites' },
          },
          required: [],
        },
      },
      handler: async (args) => {
        let recipes = recipe.getSavedRecipes(userPhone);
        if (args.filter) {
          const f = (args.filter as string).toLowerCase();
          recipes = recipes.filter(r => r.cuisine?.toLowerCase().includes(f));
        }
        if (args.favorites_only) {
          recipes = recipes.filter(r => r.is_favorite);
        }
        return JSON.stringify({
          count: recipes.length,
          recipes: recipes.slice(0, 20).map(r => ({
            id: r.id,
            name: r.recipe_name,
            cuisine: r.cuisine,
            cook_time_min: r.cook_time_min,
            rating: r.user_rating,
            times_cooked: r.times_cooked,
            is_favorite: r.is_favorite,
          })),
        });
      },
    },
    {
      definition: {
        name: 'find_recipe',
        description: 'Find a specific saved recipe by name',
        parameters: {
          type: 'object',
          properties: {
            recipe_name: { type: 'string', description: 'Name of the recipe to find' },
          },
          required: ['recipe_name'],
        },
      },
      handler: async (args) => {
        const r = recipe.findRecipeByName(userPhone, args.recipe_name as string);
        if (!r) return JSON.stringify({ found: false });
        return JSON.stringify({
          found: true,
          recipe: {
            id: r.id,
            name: r.recipe_name,
            steps: r.modified_recipe_steps || r.original_recipe_steps,
            ingredients: r.ingredients,
            cook_time_min: r.cook_time_min,
            cuisine: r.cuisine,
            rating: r.user_rating,
            notes: r.notes,
            times_cooked: r.times_cooked,
            is_favorite: r.is_favorite,
          },
        });
      },
    },
    {
      definition: {
        name: 'save_recipe',
        description: 'Save a new recipe to the user\'s recipe collection',
        parameters: {
          type: 'object',
          properties: {
            recipe_name: { type: 'string' },
            recipe_steps: { type: 'string', description: 'Step-by-step cooking instructions' },
            ingredients: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  qty: { type: 'string' },
                  unit: { type: 'string' },
                },
                required: ['name', 'qty', 'unit'],
              },
            },
            cook_time_min: { type: 'number' },
            cuisine: { type: 'string' },
          },
          required: ['recipe_name', 'recipe_steps', 'ingredients'],
        },
      },
      handler: async (args) => {
        const existing = recipe.findRecipeByName(userPhone, args.recipe_name as string);
        if (existing) return JSON.stringify({ success: false, error: 'Recipe already exists', existing_id: existing.id });
        const id = recipe.saveRecipe(userPhone, {
          recipe_name: args.recipe_name as string,
          original_recipe_steps: args.recipe_steps as string,
          ingredients: args.ingredients as Array<{ name: string; qty: string; unit: string }>,
          cook_time_min: args.cook_time_min as number | undefined,
          cuisine: args.cuisine as string | undefined,
        });
        return JSON.stringify({ success: true, id });
      },
    },
    {
      definition: {
        name: 'rate_recipe',
        description: 'Rate a saved recipe (1-5 stars) and optionally add notes',
        parameters: {
          type: 'object',
          properties: {
            recipe_name: { type: 'string', description: 'Name of the recipe to rate' },
            rating: { type: 'number', description: 'Rating from 1 to 5' },
            notes: { type: 'string', description: 'Optional notes about the recipe' },
          },
          required: ['recipe_name', 'rating'],
        },
      },
      handler: async (args) => {
        const r = recipe.findRecipeByName(userPhone, args.recipe_name as string);
        if (!r) return JSON.stringify({ success: false, error: 'Recipe not found' });
        recipe.updateRecipeRating(r.id, args.rating as number, args.notes as string | undefined);
        return JSON.stringify({ success: true, recipe: args.recipe_name, rating: args.rating });
      },
    },
    {
      definition: {
        name: 'modify_recipe',
        description: 'Update the modifications/notes for a saved recipe',
        parameters: {
          type: 'object',
          properties: {
            recipe_name: { type: 'string' },
            modification: { type: 'string', description: 'The modification to record' },
          },
          required: ['recipe_name', 'modification'],
        },
      },
      handler: async (args) => {
        const r = recipe.findRecipeByName(userPhone, args.recipe_name as string);
        if (!r) return JSON.stringify({ success: false, error: 'Recipe not found' });
        recipe.updateRecipeModifications(r.id, args.modification as string);
        return JSON.stringify({ success: true });
      },
    },
    {
      definition: {
        name: 'get_current_meal_plan',
        description: 'Get the user\'s current weekly meal plan with all planned meals',
        parameters: { type: 'object', properties: {}, required: [] },
      },
      handler: async () => {
        const plan = mealPlan.getCurrentPlan(userPhone);
        if (!plan) return JSON.stringify({ has_plan: false });
        return JSON.stringify({
          has_plan: true,
          week_start: plan.week_start,
          status: plan.status,
          meals: plan.meals.map(m => ({
            day: m.day,
            meal_type: m.meal_type,
            recipe_name: m.recipe_name,
            cook_time_min: m.cook_time_min,
            status: m.status,
            rating: m.user_rating,
          })),
        });
      },
    },
    {
      definition: {
        name: 'update_preferences',
        description: 'Update user cooking preferences like cuisines, dietary restrictions, household size, or skill level',
        parameters: {
          type: 'object',
          properties: {
            cuisine_preferences: { type: 'array', items: { type: 'string' }, description: 'List of preferred cuisines' },
            dietary_restrictions: { type: 'array', items: { type: 'string' }, description: 'List of dietary restrictions' },
            household_size: { type: 'number', description: 'Number of people cooking for' },
            skill_level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
          },
          required: [],
        },
      },
      handler: async (args) => {
        const fields: Record<string, unknown> = {};
        if (args.cuisine_preferences) fields.cuisine_preferences = args.cuisine_preferences;
        if (args.dietary_restrictions) fields.dietary_restrictions = args.dietary_restrictions;
        if (args.household_size) fields.household_size = args.household_size;
        if (args.skill_level) fields.skill_level = args.skill_level;
        if (Object.keys(fields).length === 0) return JSON.stringify({ success: false, error: 'No fields provided' });
        updateUser(userPhone, fields as Parameters<typeof updateUser>[1]);
        return JSON.stringify({ success: true, updated: Object.keys(fields) });
      },
    },
    {
      definition: {
        name: 'update_schedule',
        description: 'Update cooking schedule: cook days, grocery day, or times',
        parameters: {
          type: 'object',
          properties: {
            cook_days: { type: 'array', items: { type: 'string' }, description: 'Days to cook (e.g. ["Monday", "Wednesday", "Friday"])' },
            grocery_day: { type: 'string', description: 'Day for grocery shopping' },
            grocery_time: { type: 'string', description: 'Time for grocery reminder (HH:MM)' },
            cook_reminder_time: { type: 'string', description: 'Time for cook reminder (HH:MM)' },
          },
          required: [],
        },
      },
      handler: async (args) => {
        const fields: Record<string, unknown> = {};
        if (args.cook_days) fields.cook_days = args.cook_days;
        if (args.grocery_day) fields.grocery_day = args.grocery_day;
        if (args.grocery_time) fields.grocery_time = args.grocery_time;
        if (args.cook_reminder_time) fields.cook_reminder_time = args.cook_reminder_time;
        if (Object.keys(fields).length === 0) return JSON.stringify({ success: false, error: 'No fields provided' });
        updateUser(userPhone, fields as Parameters<typeof updateUser>[1]);
        return JSON.stringify({ success: true, updated: Object.keys(fields) });
      },
    },
    {
      definition: {
        name: 'log_meal',
        description: 'Log that the user cooked a meal (not from the plan)',
        parameters: {
          type: 'object',
          properties: {
            recipe_name: { type: 'string' },
          },
          required: ['recipe_name'],
        },
      },
      handler: async (args) => {
        const r = recipe.findRecipeByName(userPhone, args.recipe_name as string);
        if (r) {
          recipe.incrementTimesCooked(r.id);
        }
        return JSON.stringify({ success: true, logged: args.recipe_name });
      },
    },
    {
      definition: {
        name: 'generate_meal_plan',
        description: 'Generate a new weekly meal plan based on the user\'s preferences. Limited to 3 per day. Use this when the user asks for a new meal plan, fresh plan, or wants to replan their week.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
      handler: async () => {
        const todayCount = mealPlan.countTodaysMealPlans(userPhone);
        if (todayCount >= 3) {
          return JSON.stringify({ success: false, error: 'Daily limit reached (3 meal plans per day). Try again tomorrow.' });
        }
        const user = getUser(userPhone);
        if (!user) {
          return JSON.stringify({ success: false, error: 'User not found' });
        }
        if (user.cook_days.length === 0) {
          return JSON.stringify({ success: false, error: 'No cook days set. Ask the user to set their cook days first.' });
        }
        const reply = await generateAndSendMealPlan(user);
        return JSON.stringify({ success: true, reply });
      },
    },
  ];
}
