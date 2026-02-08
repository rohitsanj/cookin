import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import type { MealPlan, PlannedMeal } from '../types';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_TYPE_ORDER = { breakfast: 0, lunch: 1, dinner: 2 };
const MEAL_TYPE_ICON: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' };

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-accent-soft text-accent',
    cooked: 'bg-success/15 text-success',
    skipped: 'bg-muted/20 text-muted',
    draft: 'bg-accent-soft text-accent',
    confirmed: 'bg-success/15 text-success',
    completed: 'bg-muted/20 text-muted',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}

function StarRating({
  rating,
  onRate,
}: {
  rating: number | null;
  onRate: (r: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? rating ?? 0;

  return (
    <div className="flex gap-0.5" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          className={`text-sm cursor-pointer transition-colors ${
            star <= display ? 'text-accent' : 'text-muted/30'
          }`}
          onMouseEnter={() => setHover(star)}
          onClick={(e) => { e.stopPropagation(); onRate(star); }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function HeartButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`transition-colors cursor-pointer ${active ? 'text-red-500' : 'text-muted/40 hover:text-red-400'}`}
    >
      {active ? '♥' : '♡'}
    </button>
  );
}

function MealCard({
  meal,
  expanded,
  onToggle,
  onUpdate,
}: {
  meal: PlannedMeal;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (updated: PlannedMeal) => void;
}) {
  const [comment, setComment] = useState(meal.user_comment || '');
  const [saving, setSaving] = useState(false);
  const [savedRecipe, setSavedRecipe] = useState<boolean | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleRate = useCallback(async (rating: number) => {
    onUpdate({ ...meal, user_rating: rating });
    await api.mealPlans.updateRating(meal.id, rating).catch(() => {});
  }, [meal, onUpdate]);

  const handleFavorite = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = !meal.is_favorite;
    onUpdate({ ...meal, is_favorite: newVal });
    await api.mealPlans.toggleFavorite(meal.id).catch(() => {
      onUpdate({ ...meal, is_favorite: !newVal });
    });
  }, [meal, onUpdate]);

  const handleStatus = useCallback(async (status: 'cooked' | 'skipped') => {
    onUpdate({ ...meal, status });
    await api.mealPlans.updateStatus(meal.id, status).catch(() => {});
  }, [meal, onUpdate]);

  const handleCommentChange = useCallback((value: string) => {
    setComment(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      onUpdate({ ...meal, user_comment: value || null });
      await api.mealPlans.updateComment(meal.id, value).catch(() => {});
    }, 500);
  }, [meal, onUpdate]);

  const handleCommentBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onUpdate({ ...meal, user_comment: comment || null });
    api.mealPlans.updateComment(meal.id, comment).catch(() => {});
  }, [meal, comment, onUpdate]);

  const handleSaveRecipe = useCallback(async () => {
    setSaving(true);
    try {
      await api.mealPlans.saveAsRecipe(meal.id);
      setSavedRecipe(true);
    } catch (err: any) {
      if (err.message?.includes('409') || err.message?.includes('already')) {
        setSavedRecipe(true);
      }
    } finally {
      setSaving(false);
    }
  }, [meal.id]);

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      {/* Collapsed row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-card-hover/50 transition-colors cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm" title={meal.meal_type}>{MEAL_TYPE_ICON[meal.meal_type] || '🍽️'}</span>
            <span className="font-medium text-sm truncate">{meal.recipe_name}</span>
            <StatusBadge status={meal.status} />
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {meal.cook_time_min && (
              <span className="text-xs text-muted">{meal.cook_time_min} min</span>
            )}
            {meal.ingredients.length > 0 && (
              <span className="text-xs text-muted">{meal.ingredients.length} ingredients</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {meal.user_rating && (
            <span className="text-xs text-accent">
              {'★'.repeat(meal.user_rating)}
            </span>
          )}
          <HeartButton active={meal.is_favorite} onClick={handleFavorite} />
          <svg
            className={`w-4 h-4 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded section */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/30 space-y-3">
          {/* Rating */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Rate:</span>
            <StarRating rating={meal.user_rating} onRate={handleRate} />
          </div>

          {/* Ingredients */}
          {meal.ingredients.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1.5">Ingredients</p>
              <div className="flex flex-wrap gap-1.5">
                {meal.ingredients.map((ing, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-1 rounded-md bg-card-hover text-text"
                  >
                    {ing.qty} {ing.unit} {ing.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Comment */}
          <div>
            <p className="text-xs text-muted mb-1.5">Notes</p>
            <textarea
              value={comment}
              onChange={e => handleCommentChange(e.target.value)}
              onBlur={handleCommentBlur}
              onClick={e => e.stopPropagation()}
              placeholder="Add notes about this meal..."
              rows={2}
              className="w-full text-sm bg-bg border border-border rounded-lg px-3 py-2 resize-none placeholder:text-muted/50 focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {meal.status === 'pending' && (
              <>
                <button
                  type="button"
                  onClick={() => handleStatus('cooked')}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors cursor-pointer"
                >
                  Mark Cooked
                </button>
                <button
                  type="button"
                  onClick={() => handleStatus('skipped')}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-muted/10 text-muted hover:bg-muted/20 transition-colors cursor-pointer"
                >
                  Skip
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleSaveRecipe}
              disabled={saving || savedRecipe === true}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-soft text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-default"
            >
              {savedRecipe ? 'Saved!' : saving ? 'Saving...' : 'Save to Recipes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MealPlansPage() {
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api.mealPlans.current()
      .then(({ mealPlan }) => setPlan(mealPlan))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateMeal = useCallback((updated: PlannedMeal) => {
    setPlan(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        meals: prev.meals.map(m => m.id === updated.id ? updated : m),
      };
    });
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        Loading meal plan...
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-3xl mb-3">🍽️</p>
        <h2 className="text-lg font-medium mb-2">No meal plan yet</h2>
        <p className="text-muted text-sm max-w-sm">
          Use the chat widget (click the button in the bottom right) to generate a personalized meal plan based on your preferences.
        </p>
      </div>
    );
  }

  const mealsByDay = new Map<string, PlannedMeal[]>();
  for (const meal of plan.meals) {
    const existing = mealsByDay.get(meal.day) || [];
    existing.push(meal);
    mealsByDay.set(meal.day, existing);
  }

  const sortedDays = [...mealsByDay.entries()].sort(
    (a, b) => DAY_ORDER.indexOf(a[0]) - DAY_ORDER.indexOf(b[0])
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-medium">
              Week of {new Date(plan.week_start).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
              })}
            </h2>
            <StatusBadge status={plan.status} />
          </div>
        </div>

        <div className="space-y-4">
          {sortedDays.map(([day, meals]) => (
            <div key={day} className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-sm font-medium text-accent mb-3">{day}</h3>
              <div className="space-y-2">
                {[...meals].sort((a, b) => (MEAL_TYPE_ORDER[a.meal_type] ?? 3) - (MEAL_TYPE_ORDER[b.meal_type] ?? 3)).map(meal => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    expanded={expandedId === meal.id}
                    onToggle={() => setExpandedId(prev => prev === meal.id ? null : meal.id)}
                    onUpdate={updateMeal}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
