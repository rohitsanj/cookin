import { getDb } from '../db/connection.js';
import { v4 as uuid } from 'uuid';

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

export interface GroceryList {
  id: string;
  meal_plan_id: string;
  items: Array<{ name: string; qty: string; unit: string; section: string }>;
  sent_at: string | null;
  fulfilled: boolean;
  created_at: string;
}

interface MealPlanRow {
  id: string;
  user_phone: string;
  week_start: string;
  status: string;
  created_at: string;
}

interface PlannedMealRow {
  id: string;
  meal_plan_id: string;
  day: string;
  meal_type: string;
  recipe_name: string;
  recipe_steps: string | null;
  ingredients: string;
  cook_time_min: number | null;
  status: string;
  user_rating: number | null;
  user_comment: string | null;
  is_favorite: number;
  created_at: string;
}

interface GroceryListRow {
  id: string;
  meal_plan_id: string;
  items: string;
  sent_at: string | null;
  fulfilled: number;
  created_at: string;
}

function deserializeMeal(row: PlannedMealRow): PlannedMeal {
  return {
    ...row,
    meal_type: (row.meal_type || 'dinner') as PlannedMeal['meal_type'],
    ingredients: JSON.parse(row.ingredients),
    status: row.status as PlannedMeal['status'],
    is_favorite: row.is_favorite === 1,
  };
}

export function countTodaysMealPlans(userPhone: string): number {
  const row = getDb().prepare(
    "SELECT COUNT(*) as count FROM meal_plan WHERE user_phone = ? AND created_at >= date('now')"
  ).get(userPhone) as { count: number };
  return row.count;
}

export function getCurrentPlan(userPhone: string): MealPlan | null {
  const row = getDb().prepare(
    "SELECT * FROM meal_plan WHERE user_phone = ? AND status IN ('draft', 'confirmed') ORDER BY week_start DESC LIMIT 1"
  ).get(userPhone) as MealPlanRow | undefined;
  if (!row) return null;

  // Auto-complete stale plans (older than 7 days)
  const weekStart = new Date(row.week_start);
  const daysSince = (Date.now() - weekStart.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince >= 7) {
    getDb().prepare("UPDATE meal_plan SET status = 'completed' WHERE id = ?").run(row.id);
    return null;
  }

  const mealRows = getDb().prepare(
    'SELECT * FROM planned_meal WHERE meal_plan_id = ? ORDER BY day'
  ).all(row.id) as PlannedMealRow[];

  return {
    ...row,
    status: row.status as MealPlan['status'],
    meals: mealRows.map(deserializeMeal),
  };
}

export function createMealPlan(userPhone: string, weekStart: string): string {
  const id = uuid();
  getDb().prepare(
    'INSERT INTO meal_plan (id, user_phone, week_start) VALUES (?, ?, ?)'
  ).run(id, userPhone, weekStart);
  return id;
}

export function addPlannedMeal(planId: string, meal: {
  day: string;
  meal_type?: 'breakfast' | 'lunch' | 'dinner';
  recipe_name: string;
  recipe_steps: string;
  ingredients: Array<{ name: string; qty: string; unit: string }>;
  cook_time_min: number;
}): string {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO planned_meal (id, meal_plan_id, day, meal_type, recipe_name, recipe_steps, ingredients, cook_time_min)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, planId, meal.day, meal.meal_type || 'dinner', meal.recipe_name, meal.recipe_steps, JSON.stringify(meal.ingredients), meal.cook_time_min);
  return id;
}

export function confirmPlan(planId: string): void {
  getDb().prepare("UPDATE meal_plan SET status = 'confirmed' WHERE id = ?").run(planId);
}

export function updateMealStatus(mealId: string, status: 'cooked' | 'skipped', rating?: number): void {
  if (rating !== undefined) {
    getDb().prepare('UPDATE planned_meal SET status = ?, user_rating = ? WHERE id = ?').run(status, rating, mealId);
  } else {
    getDb().prepare('UPDATE planned_meal SET status = ? WHERE id = ?').run(status, mealId);
  }
}

export function removePlannedMeal(mealId: string): void {
  getDb().prepare('DELETE FROM planned_meal WHERE id = ?').run(mealId);
}

export function clearPlanMeals(planId: string): void {
  getDb().prepare('DELETE FROM planned_meal WHERE meal_plan_id = ?').run(planId);
}

export function getMealForDay(userPhone: string, day: string): PlannedMeal | null {
  const plan = getCurrentPlan(userPhone);
  if (!plan) return null;
  return plan.meals.find(m => m.day === day && m.status === 'pending') ?? null;
}

export function createGroceryList(planId: string, items: GroceryList['items']): string {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO grocery_list (id, meal_plan_id, items, sent_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(id, planId, JSON.stringify(items));
  return id;
}

export function getGroceryList(planId: string): GroceryList | null {
  const row = getDb().prepare(
    'SELECT * FROM grocery_list WHERE meal_plan_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(planId) as GroceryListRow | undefined;
  if (!row) return null;
  return { ...row, items: JSON.parse(row.items), fulfilled: row.fulfilled === 1 };
}

export function fulfillGroceryList(id: string): void {
  getDb().prepare('UPDATE grocery_list SET fulfilled = 1 WHERE id = ?').run(id);
}

export function getPlannedMeal(mealId: string): PlannedMeal | null {
  const row = getDb().prepare('SELECT * FROM planned_meal WHERE id = ?').get(mealId) as PlannedMealRow | undefined;
  return row ? deserializeMeal(row) : null;
}

export function updateMealRating(mealId: string, rating: number): void {
  getDb().prepare('UPDATE planned_meal SET user_rating = ? WHERE id = ?').run(rating, mealId);
}

export function updateMealComment(mealId: string, comment: string | null): void {
  getDb().prepare('UPDATE planned_meal SET user_comment = ? WHERE id = ?').run(comment, mealId);
}

export function toggleMealFavorite(mealId: string): boolean {
  const row = getDb().prepare('SELECT is_favorite FROM planned_meal WHERE id = ?').get(mealId) as { is_favorite: number } | undefined;
  if (!row) throw new Error('Meal not found');
  const newValue = row.is_favorite === 1 ? 0 : 1;
  getDb().prepare('UPDATE planned_meal SET is_favorite = ? WHERE id = ?').run(newValue, mealId);
  return newValue === 1;
}
