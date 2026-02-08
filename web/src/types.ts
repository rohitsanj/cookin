export interface WebUser {
  id: string;
  google_id: string;
  email: string;
  name: string | null;
  picture: string | null;
  phone_number: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface PlannedMeal {
  id: string;
  meal_plan_id: string;
  day: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  recipe_name: string;
  recipe_steps: string | null;
  ingredients: Array<{ name: string; qty: string; unit: string }>;
  cook_time_min: number | null;
  status: 'pending' | 'cooked' | 'skipped';
  user_rating: number | null;
  user_comment: string | null;
  is_favorite: boolean;
  created_at: string;
}

export interface MealPlan {
  id: string;
  user_phone: string;
  week_start: string;
  status: 'draft' | 'confirmed' | 'completed';
  created_at: string;
  meals: PlannedMeal[];
}

export interface UserPreferences {
  name: string | null;
  cuisine_preferences: string[];
  dietary_restrictions: string[];
  household_size: number;
  skill_level: 'beginner' | 'intermediate' | 'advanced';
  cook_days: string[];
  grocery_day: string | null;
  grocery_time: string;
  cook_reminder_time: string;
  timezone: string;
  max_messages_per_day: number;
}

export interface SavedRecipe {
  id: string;
  recipe_name: string;
  original_recipe_steps: string | null;
  modified_recipe_steps: string | null;
  ingredients: Array<{ name: string; qty: string; unit: string }>;
  cook_time_min: number | null;
  cuisine: string | null;
  user_rating: number | null;
  notes: string | null;
  times_cooked: number;
  last_cooked: string | null;
  is_favorite: boolean;
  created_at: string;
}
