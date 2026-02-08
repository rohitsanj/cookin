import type { WebUser, MealPlan, UserPreferences, SavedRecipe } from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    throw new AuthError('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  return res.json();
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export const api = {
  auth: {
    loginWithGoogle: (credential: string) =>
      request<{ user: WebUser }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      }),

    me: () => request<{ user: WebUser }>('/api/auth/me'),

    logout: () =>
      request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  },

  chat: {
    send: (message: string) =>
      request<{ response: string }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),

    history: () =>
      request<{ messages: Array<{ role: 'user' | 'assistant'; content: string }> }>('/api/messages'),
  },

  mealPlans: {
    current: () => request<{ mealPlan: MealPlan | null }>('/api/meal-plans'),

    updateRating: (mealId: string, rating: number) =>
      request<{ success: boolean }>(`/api/meals/${mealId}/rating`, {
        method: 'PATCH',
        body: JSON.stringify({ rating }),
      }),

    updateComment: (mealId: string, comment: string) =>
      request<{ success: boolean }>(`/api/meals/${mealId}/comment`, {
        method: 'PATCH',
        body: JSON.stringify({ comment }),
      }),

    toggleFavorite: (mealId: string) =>
      request<{ is_favorite: boolean }>(`/api/meals/${mealId}/favorite`, {
        method: 'PATCH',
      }),

    updateStatus: (mealId: string, status: 'cooked' | 'skipped') =>
      request<{ success: boolean }>(`/api/meals/${mealId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),

    saveAsRecipe: (mealId: string) =>
      request<{ success: boolean; recipeId: string }>(`/api/meals/${mealId}/save`, {
        method: 'POST',
      }),
  },

  preferences: {
    get: () => request<{ preferences: UserPreferences }>('/api/preferences'),

    update: (prefs: Partial<UserPreferences>) =>
      request<{ ok: boolean }>('/api/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      }),
  },

  recipes: {
    list: () => request<{ recipes: SavedRecipe[] }>('/api/recipes'),

    toggleFavorite: (recipeId: string) =>
      request<{ is_favorite: boolean }>(`/api/recipes/${recipeId}/favorite`, {
        method: 'PATCH',
      }),
  },

  calendar: {
    status: () => request<{ connected: boolean; scopes: string[] }>('/api/calendar/status'),

    connect: (code: string) =>
      request<{ connected: boolean }>('/api/calendar/connect', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),

    sync: () =>
      request<{ success: boolean; created: number }>('/api/calendar/sync', {
        method: 'POST',
      }),
  },
};
