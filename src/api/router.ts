import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAuth, sessionStore } from './middleware.js';
import { getOrCreateWebUser, getWebUser } from '../services/web-user.js';
import { handleWebChat } from './chat.js';
import { getCurrentPlan, getPlannedMeal, updateMealStatus, updateMealRating, updateMealComment, toggleMealFavorite } from '../services/meal-plan.js';
import { getUser, updateUser } from '../services/user.js';
import { getRecentMessages } from '../services/message-throttle.js';
import { getSavedRecipes, saveRecipe, findRecipeByName, toggleRecipeFavorite } from '../services/recipe.js';
import { config } from '../config.js';
import { exchangeCodeForTokens, syncScheduleToCalendar, hasCalendarTokens, SCOPES } from '../services/google-calendar.js';

const router = Router();

// Session expiration: 7 days
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

/**
 * Decode Google ID token (JWT) without verification.
 * Google Sign-In button already verifies the token, so we just extract the payload.
 */
function decodeGoogleToken(token: string): {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
} {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const payload = JSON.parse(
    Buffer.from(parts[1], 'base64').toString('utf-8')
  );

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}

// ============================================================================
// Auth endpoints
// ============================================================================

/**
 * POST /api/auth/google
 * Receives Google ID token, creates/updates web_user, returns session
 */
router.post('/auth/google', async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      res.status(400).json({ error: 'Missing credential' });
      return;
    }

    // Decode the Google ID token
    const { sub: googleId, email, name, picture } = decodeGoogleToken(credential);

    // Get or create web user
    const webUser = getOrCreateWebUser(googleId, email, name || null, picture || null);

    // Create session
    const sessionToken = uuid();
    sessionStore.set(sessionToken, {
      userId: webUser.id,
      expiresAt: Date.now() + SESSION_DURATION,
    });

    // Set httpOnly cookie
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DURATION,
      sameSite: 'lax',
    });

    res.json({
      user: {
        id: webUser.id,
        email: webUser.email,
        name: webUser.name,
        picture: webUser.picture,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * GET /api/auth/me
 * Returns current user info from session
 */
router.get('/auth/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const webUser = getWebUser(req.userId!);

    if (!webUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: webUser.id,
        email: webUser.email,
        name: webUser.name,
        picture: webUser.picture,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * POST /api/auth/logout
 * Clears session
 */
router.post('/auth/logout', (req: Request, res: Response) => {
  const sessionToken = req.cookies?.session;

  if (sessionToken) {
    sessionStore.delete(sessionToken);
  }

  res.clearCookie('session');
  res.json({ success: true });
});

// ============================================================================
// Chat endpoint
// ============================================================================

/**
 * POST /api/chat
 * Receives message, returns AI response
 */
router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Missing or invalid message' });
      return;
    }

    // Use web-based identifier: "web:{userId}"
    const userIdentifier = `web:${req.userId}`;

    // Handle the chat message
    const response = await handleWebChat(userIdentifier, message);

    res.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// ============================================================================
// Data endpoints
// ============================================================================

/**
 * GET /api/meal-plans
 * Returns current meal plan for the user
 */
router.get('/meal-plans', requireAuth, async (req: Request, res: Response) => {
  try {
    const userIdentifier = `web:${req.userId}`;
    const mealPlan = getCurrentPlan(userIdentifier);

    res.json({ mealPlan });
  } catch (error) {
    console.error('Get meal plan error:', error);
    res.status(500).json({ error: 'Failed to fetch meal plan' });
  }
});

/**
 * GET /api/preferences
 * Returns user preferences
 */
router.get('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const userIdentifier = `web:${req.userId}`;
    const user = getUser(userIdentifier);

    if (!user) {
      res.status(404).json({ error: 'User preferences not found' });
      return;
    }

    res.json({
      preferences: {
        name: user.name,
        cuisine_preferences: user.cuisine_preferences,
        dietary_restrictions: user.dietary_restrictions,
        household_size: user.household_size,
        skill_level: user.skill_level,
        cook_days: user.cook_days,
        grocery_day: user.grocery_day,
        grocery_time: user.grocery_time,
        cook_reminder_time: user.cook_reminder_time,
        timezone: user.timezone,
        max_messages_per_day: user.max_messages_per_day,
      },
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/preferences
 * Updates user preferences
 */
router.put('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const userIdentifier = `web:${req.userId}`;
    const {
      name,
      cuisine_preferences,
      dietary_restrictions,
      household_size,
      skill_level,
      cook_days,
      grocery_day,
      cook_reminder_time,
      timezone,
      max_messages_per_day,
    } = req.body;

    // Build update object with only provided fields
    const updates: any = {};

    if (name !== undefined) updates.name = name;
    if (cuisine_preferences !== undefined) updates.cuisine_preferences = cuisine_preferences;
    if (dietary_restrictions !== undefined) updates.dietary_restrictions = dietary_restrictions;
    if (household_size !== undefined) updates.household_size = household_size;
    if (skill_level !== undefined) updates.skill_level = skill_level;
    if (cook_days !== undefined) updates.cook_days = cook_days;
    if (grocery_day !== undefined) updates.grocery_day = grocery_day;
    if (cook_reminder_time !== undefined) updates.cook_reminder_time = cook_reminder_time;
    if (timezone !== undefined) updates.timezone = timezone;
    if (max_messages_per_day !== undefined) updates.max_messages_per_day = max_messages_per_day;

    updateUser(userIdentifier, updates);

    res.json({ success: true });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * GET /api/messages
 * Returns recent message history
 */
router.get('/messages', requireAuth, async (req: Request, res: Response) => {
  try {
    const userIdentifier = `web:${req.userId}`;
    const limit = parseInt(req.query.limit as string) || 50;

    const messages = getRecentMessages(userIdentifier, limit);

    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * GET /api/recipes
 * Returns saved recipes for the user
 */
router.get('/recipes', requireAuth, async (req: Request, res: Response) => {
  try {
    const userIdentifier = `web:${req.userId}`;
    const recipes = getSavedRecipes(userIdentifier);
    res.json({ recipes });
  } catch (error) {
    console.error('Get recipes error:', error);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
});

// ============================================================================
// Meal interaction endpoints
// ============================================================================

router.patch('/meals/:mealId/rating', requireAuth, async (req: Request, res: Response) => {
  try {
    const mealId = req.params.mealId as string;
    const { rating } = req.body;
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Rating must be 1-5' });
      return;
    }
    updateMealRating(mealId, rating);
    res.json({ success: true });
  } catch (error) {
    console.error('Update meal rating error:', error);
    res.status(500).json({ error: 'Failed to update rating' });
  }
});

router.patch('/meals/:mealId/comment', requireAuth, async (req: Request, res: Response) => {
  try {
    const mealId = req.params.mealId as string;
    const { comment } = req.body;
    updateMealComment(mealId, comment || null);
    res.json({ success: true });
  } catch (error) {
    console.error('Update meal comment error:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

router.patch('/meals/:mealId/favorite', requireAuth, async (req: Request, res: Response) => {
  try {
    const mealId = req.params.mealId as string;
    const is_favorite = toggleMealFavorite(mealId);
    res.json({ is_favorite });
  } catch (error) {
    console.error('Toggle meal favorite error:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

router.patch('/meals/:mealId/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const mealId = req.params.mealId as string;
    const { status, rating } = req.body;
    if (!['cooked', 'skipped'].includes(status)) {
      res.status(400).json({ error: 'Status must be cooked or skipped' });
      return;
    }
    updateMealStatus(mealId, status, rating);
    res.json({ success: true });
  } catch (error) {
    console.error('Update meal status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

router.post('/meals/:mealId/save', requireAuth, async (req: Request, res: Response) => {
  try {
    const mealId = req.params.mealId as string;
    const userIdentifier = `web:${req.userId}`;
    const meal = getPlannedMeal(mealId);
    if (!meal) {
      res.status(404).json({ error: 'Meal not found' });
      return;
    }
    const existing = findRecipeByName(userIdentifier, meal.recipe_name);
    if (existing) {
      res.status(409).json({ error: 'Recipe already saved', recipeId: existing.id });
      return;
    }
    const recipeId = saveRecipe(userIdentifier, {
      recipe_name: meal.recipe_name,
      original_recipe_steps: meal.recipe_steps || '',
      ingredients: meal.ingredients,
      cook_time_min: meal.cook_time_min || undefined,
      user_rating: meal.user_rating || undefined,
      notes: meal.user_comment || undefined,
    });
    res.json({ success: true, recipeId });
  } catch (error) {
    console.error('Save meal as recipe error:', error);
    res.status(500).json({ error: 'Failed to save recipe' });
  }
});

router.patch('/recipes/:recipeId/favorite', requireAuth, async (req: Request, res: Response) => {
  try {
    const recipeId = req.params.recipeId as string;
    const is_favorite = toggleRecipeFavorite(recipeId);
    res.json({ is_favorite });
  } catch (error) {
    console.error('Toggle recipe favorite error:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// ============================================================================
// Google Calendar endpoints
// ============================================================================

/**
 * GET /api/calendar/status
 * Returns whether user has connected Google Calendar
 */
router.get('/calendar/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const connected = hasCalendarTokens(req.userId!);
    res.json({ connected, scopes: SCOPES });
  } catch (error) {
    console.error('Calendar status error:', error);
    res.status(500).json({ error: 'Failed to check calendar status' });
  }
});

/**
 * POST /api/calendar/connect
 * Receives Google authorization code, exchanges for tokens
 */
router.post('/calendar/connect', requireAuth, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    await exchangeCodeForTokens(req.userId!, code);
    res.json({ connected: true });
  } catch (error) {
    console.error('Calendar connect error:', error);
    res.status(500).json({ error: 'Failed to connect Google Calendar' });
  }
});

/**
 * POST /api/calendar/sync
 * Syncs cooking schedule to Google Calendar
 */
router.post('/calendar/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const userIdentifier = `web:${req.userId}`;
    const user = getUser(userIdentifier);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const result = await syncScheduleToCalendar(req.userId!, {
      cookDays: user.cook_days,
      cookReminderTime: user.cook_reminder_time,
      groceryDay: user.grocery_day,
      groceryTime: user.grocery_time,
      timezone: user.timezone,
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Calendar sync error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync calendar' });
  }
});

export { router as apiRouter };
