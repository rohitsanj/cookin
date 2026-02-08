import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { SavedRecipe } from '../types';

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return null;

  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  return <span className="text-accent text-sm">{stars}</span>;
}

function RecipeCard({
  recipe,
  onToggleFavorite,
}: {
  recipe: SavedRecipe;
  onToggleFavorite: (id: string) => void;
}) {
  const [showIngredients, setShowIngredients] = useState(false);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-base mb-1">{recipe.recipe_name}</h3>
          <div className="flex items-center gap-3 flex-wrap">
            {recipe.cuisine && (
              <span className="text-xs bg-accent-soft text-accent px-2 py-0.5 rounded-full">
                {recipe.cuisine}
              </span>
            )}
            {recipe.cook_time_min && (
              <span className="text-xs text-muted">
                {recipe.cook_time_min} min
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StarRating rating={recipe.user_rating} />
          <button
            type="button"
            onClick={() => onToggleFavorite(recipe.id)}
            className={`text-lg transition-colors cursor-pointer ${
              recipe.is_favorite ? 'text-red-500' : 'text-muted/40 hover:text-red-400'
            }`}
          >
            {recipe.is_favorite ? '♥' : '♡'}
          </button>
        </div>
      </div>

      {/* Ingredients */}
      <div className="mb-3">
        <button
          onClick={() => setShowIngredients(!showIngredients)}
          className="text-sm text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-1"
        >
          <span>{showIngredients ? '▼' : '▶'}</span>
          <span>
            {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''}
          </span>
        </button>
        {showIngredients && (
          <ul className="mt-2 space-y-1 text-sm text-muted pl-4">
            {recipe.ingredients.map((ing, idx) => (
              <li key={idx}>
                {ing.qty} {ing.unit} {ing.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-4 text-xs text-muted">
        {recipe.times_cooked > 0 && (
          <span>Cooked {recipe.times_cooked}x</span>
        )}
        {recipe.last_cooked && (
          <span>Last: {formatDate(recipe.last_cooked)}</span>
        )}
      </div>

      {/* Notes */}
      {recipe.notes && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-sm text-muted italic">{recipe.notes}</p>
        </div>
      )}
    </div>
  );
}

export function RecipesPage() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const navigate = useNavigate();

  useEffect(() => {
    api.recipes.list()
      .then(({ recipes }) => setRecipes(recipes))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    setRecipes(prev =>
      prev.map(r => r.id === id ? { ...r, is_favorite: !r.is_favorite } : r)
    );
    await api.recipes.toggleFavorite(id).catch(() => {
      setRecipes(prev =>
        prev.map(r => r.id === id ? { ...r, is_favorite: !r.is_favorite } : r)
      );
    });
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        Loading recipes...
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-3xl mb-3">📖</p>
        <h2 className="text-lg font-medium mb-2">No saved recipes yet</h2>
        <p className="text-muted text-sm mb-6 max-w-sm">
          Your saved recipes will appear here. Save your favorite meals from the Meal Plans tab.
        </p>
        <button
          onClick={() => navigate('/')}
          className="bg-accent text-bg font-medium rounded-xl px-6 py-3 text-sm hover:opacity-90 transition-opacity cursor-pointer"
        >
          Go to Chat
        </button>
      </div>
    );
  }

  const displayed = filter === 'favorites'
    ? recipes.filter(r => r.is_favorite)
    : recipes;

  const favCount = recipes.filter(r => r.is_favorite).length;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-medium mb-1">Saved Recipes</h2>
            <p className="text-sm text-muted">
              {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} saved
            </p>
          </div>
          {favCount > 0 && (
            <div className="flex gap-1 bg-card rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  filter === 'all' ? 'bg-accent text-bg font-medium' : 'text-muted hover:text-text'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter('favorites')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  filter === 'favorites' ? 'bg-accent text-bg font-medium' : 'text-muted hover:text-text'
                }`}
              >
                Favorites ({favCount})
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {displayed.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onToggleFavorite={toggleFavorite}
            />
          ))}
          {filter === 'favorites' && displayed.length === 0 && (
            <p className="text-center text-muted text-sm py-8">
              No favorites yet. Tap the heart on a recipe to favorite it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
