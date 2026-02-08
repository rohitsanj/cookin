---
name: recipes-tab
description: "Add a Recipes tab to the Cookin' web UI that displays the user's saved recipes with ratings, ingredients, cook times, and cuisine tags."
model: sonnet
color: green
---

You are adding a "Recipes" tab to the Cookin' web application. The app is a meal planning assistant with a React + TypeScript frontend (Vite + Tailwind CSS) and an Express + TypeScript backend (SQLite).

## Task

Add a Recipes tab that shows the user's saved recipes. The tab should display recipe cards with name, rating (stars), cuisine, cook time, ingredients, times cooked, and notes. Include an empty state when no recipes exist.

## What exists

### Backend service: `src/services/recipe.ts`
Already has all the functions needed:
- `getSavedRecipes(userPhone)` — returns all saved recipes sorted by rating/times cooked
- `getSavedRecipe(id)` — get single recipe
- `saveRecipe(...)`, `updateRecipeRating(...)`, `updateRecipeModifications(...)`, `incrementTimesCooked(...)`

The `SavedRecipe` interface:
```typescript
interface SavedRecipe {
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
  created_at: string;
}
```

### Backend API router: `src/api/router.ts`
Existing pattern — add a `GET /api/recipes` endpoint. Use `requireAuth` middleware from `src/api/middleware.ts`. The authenticated user identifier is `web:${req.userId}`. Import `getSavedRecipes` from `../services/recipe.js`.

### Frontend API client: `web/src/api.ts`
Add a `recipes.list()` method that calls `GET /api/recipes`.

### Frontend types: `web/src/types.ts`
Add a `SavedRecipe` interface matching the backend.

### Frontend routing: `web/src/App.tsx`
Add a `/recipes` route with the new `RecipesPage` component. Import pattern matches existing pages.

### Tab navigation: `web/src/components/Layout.tsx`
Add `{ path: '/recipes', label: 'Recipes' }` to the `tabs` array. Place it after "Meal Plans".

### New component: `web/src/components/RecipesPage.tsx`
Build the Recipes page. Follow the patterns in existing pages (MealPlansPage.tsx, PreferencesPage.tsx):
- Use `flex-1 overflow-y-auto px-4 py-6` for the scrollable container
- Use `max-w-2xl mx-auto` for content width
- Use `bg-card rounded-xl border border-border` for cards
- Use `text-accent` for accent color, `text-muted` for secondary text
- Empty state with emoji, heading, description, and CTA button to chat
- Loading state

Recipe cards should show:
- Recipe name (prominent)
- Star rating if available (filled/empty stars using ★/☆)
- Cuisine tag if available
- Cook time if available
- Ingredients list (collapsible or truncated)
- Times cooked count
- Last cooked date if available
- Notes if available

## Style reference

The app uses a dark theme with these Tailwind theme colors:
- `bg` (#0f0f0f), `bg-soft` (#161616), `card` (#1e1e1e)
- `text` (#f5f5f5), `muted` (#b3b3b3), `accent` (#ffb703)
- `border` (rgba(255,255,255,0.08))
- `accent-soft` (rgba(255,183,3,0.15))

## Files to modify
1. `src/api/router.ts` — add GET /api/recipes endpoint
2. `web/src/types.ts` — add SavedRecipe type
3. `web/src/api.ts` — add recipes.list() method
4. `web/src/App.tsx` — add route
5. `web/src/components/Layout.tsx` — add tab

## Files to create
1. `web/src/components/RecipesPage.tsx` — the recipes page component
