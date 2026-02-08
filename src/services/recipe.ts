import { getDb } from '../db/connection.js';
import { v4 as uuid } from 'uuid';

export interface SavedRecipe {
  id: string;
  user_phone: string;
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

interface RecipeRow {
  id: string;
  user_phone: string;
  recipe_name: string;
  original_recipe_steps: string | null;
  modified_recipe_steps: string | null;
  ingredients: string;
  cook_time_min: number | null;
  cuisine: string | null;
  user_rating: number | null;
  notes: string | null;
  times_cooked: number;
  last_cooked: string | null;
  is_favorite: number;
  created_at: string;
}

function deserialize(row: RecipeRow): SavedRecipe {
  return { ...row, ingredients: JSON.parse(row.ingredients), is_favorite: row.is_favorite === 1 };
}

export function getSavedRecipes(userPhone: string): SavedRecipe[] {
  const rows = getDb().prepare(
    'SELECT * FROM saved_recipe WHERE user_phone = ? ORDER BY user_rating DESC, times_cooked DESC'
  ).all(userPhone) as RecipeRow[];
  return rows.map(deserialize);
}

export function getSavedRecipe(id: string): SavedRecipe | null {
  const row = getDb().prepare('SELECT * FROM saved_recipe WHERE id = ?').get(id) as RecipeRow | undefined;
  return row ? deserialize(row) : null;
}

export function findRecipeByName(userPhone: string, name: string): SavedRecipe | null {
  const row = getDb().prepare(
    'SELECT * FROM saved_recipe WHERE user_phone = ? AND LOWER(recipe_name) = LOWER(?)'
  ).get(userPhone, name) as RecipeRow | undefined;
  return row ? deserialize(row) : null;
}

export function saveRecipe(userPhone: string, recipe: {
  recipe_name: string;
  original_recipe_steps: string;
  modified_recipe_steps?: string;
  ingredients: Array<{ name: string; qty: string; unit: string }>;
  cook_time_min?: number;
  cuisine?: string;
  user_rating?: number;
  notes?: string;
}): string {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO saved_recipe (id, user_phone, recipe_name, original_recipe_steps, modified_recipe_steps, ingredients, cook_time_min, cuisine, user_rating, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userPhone,
    recipe.recipe_name,
    recipe.original_recipe_steps,
    recipe.modified_recipe_steps ?? null,
    JSON.stringify(recipe.ingredients),
    recipe.cook_time_min ?? null,
    recipe.cuisine ?? null,
    recipe.user_rating ?? null,
    recipe.notes ?? null,
  );
  return id;
}

export function updateRecipeRating(id: string, rating: number, notes?: string): void {
  const sets = ['user_rating = ?'];
  const values: unknown[] = [rating];
  if (notes !== undefined) {
    sets.push('notes = ?');
    values.push(notes);
  }
  values.push(id);
  getDb().prepare(`UPDATE saved_recipe SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function updateRecipeModifications(id: string, modifiedSteps: string, notes?: string): void {
  const sets = ['modified_recipe_steps = ?'];
  const values: unknown[] = [modifiedSteps];
  if (notes !== undefined) {
    sets.push('notes = ?');
    values.push(notes);
  }
  values.push(id);
  getDb().prepare(`UPDATE saved_recipe SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function incrementTimesCooked(id: string): void {
  getDb().prepare(
    "UPDATE saved_recipe SET times_cooked = times_cooked + 1, last_cooked = date('now') WHERE id = ?"
  ).run(id);
}

export function toggleRecipeFavorite(id: string): boolean {
  const row = getDb().prepare('SELECT is_favorite FROM saved_recipe WHERE id = ?').get(id) as { is_favorite: number } | undefined;
  if (!row) throw new Error('Recipe not found');
  const newValue = row.is_favorite === 1 ? 0 : 1;
  getDb().prepare('UPDATE saved_recipe SET is_favorite = ? WHERE id = ?').run(newValue, id);
  return newValue === 1;
}
