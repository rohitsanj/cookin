import { getDb } from '../db/connection.js';
import { v4 as uuid } from 'uuid';

export interface PlannedMeal {
  id: string;
  meal_plan_id: string;
  day: string;
  recipe_name: string;
  recipe_steps: string | null;
  ingredients: Array<{ name: string; qty: string; unit: string; in_inventory?: boolean }>;
  cook_time_min: number | null;
  status: 'pending' | 'cooked' | 'skipped';
  user_rating: number | null;
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
  recipe_name: string;
  recipe_steps: string | null;
  ingredients: string;
  cook_time_min: number | null;
  status: string;
  user_rating: number | null;
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
    ingredients: JSON.parse(row.ingredients),
    status: row.status as PlannedMeal['status'],
  };
}

export function getCurrentPlan(userPhone: string): MealPlan | null {
  const row = getDb().prepare(
    "SELECT * FROM meal_plan WHERE user_phone = ? AND status IN ('draft', 'confirmed') ORDER BY week_start DESC LIMIT 1"
  ).get(userPhone) as MealPlanRow | undefined;
  if (!row) return null;

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
  recipe_name: string;
  recipe_steps: string;
  ingredients: Array<{ name: string; qty: string; unit: string; in_inventory?: boolean }>;
  cook_time_min: number;
}): string {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO planned_meal (id, meal_plan_id, day, recipe_name, recipe_steps, ingredients, cook_time_min)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, planId, meal.day, meal.recipe_name, meal.recipe_steps, JSON.stringify(meal.ingredients), meal.cook_time_min);
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
