import { useState, useEffect } from 'react';
import { api } from '../api';
import type { UserPreferences } from '../types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const COMMON_DIETS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Paleo', 'Halal', 'Kosher'];
const COMMON_CUISINES = ['Indian', 'Italian', 'Mexican', 'Chinese', 'Japanese', 'Thai', 'Mediterranean', 'American', 'Korean', 'French'];

function TagInput({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
}) {
  const [input, setInput] = useState('');

  const add = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput('');
  };

  const remove = (tag: string) => {
    onChange(value.filter(v => v !== tag));
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map(tag => (
          <span
            key={tag}
            className="bg-accent-soft text-accent text-xs px-3 py-1 rounded-full flex items-center gap-1"
          >
            {tag}
            <button
              onClick={() => remove(tag)}
              className="hover:text-text cursor-pointer"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(input);
            }
          }}
          placeholder="Type and press Enter"
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-muted focus:outline-none focus:border-accent/50"
        />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {suggestions
          .filter(s => !value.includes(s))
          .map(s => (
            <button
              key={s}
              onClick={() => add(s)}
              className="text-xs px-2.5 py-1 rounded-full border border-border text-muted hover:text-text hover:border-accent/30 transition-colors cursor-pointer"
            >
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}

export function PreferencesPage() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.preferences.get()
      .then(({ preferences }) => setPrefs(preferences))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.preferences.update(prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        Loading preferences...
      </div>
    );
  }

  if (!prefs) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <p>Start chatting to set up your preferences.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h2 className="text-lg font-medium mb-1">Preferences</h2>
          <p className="text-sm text-muted">
            These preferences influence your meal plans and chat recommendations.
          </p>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-2">Name</label>
          <input
            value={prefs.name || ''}
            onChange={e => setPrefs({ ...prefs, name: e.target.value || null })}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-muted focus:outline-none focus:border-accent/50"
            placeholder="Your name"
          />
        </div>

        {/* Cuisine Preferences */}
        <TagInput
          label="Cuisine Preferences"
          value={prefs.cuisine_preferences}
          onChange={v => setPrefs({ ...prefs, cuisine_preferences: v })}
          suggestions={COMMON_CUISINES}
        />

        {/* Dietary Restrictions */}
        <TagInput
          label="Dietary Restrictions"
          value={prefs.dietary_restrictions}
          onChange={v => setPrefs({ ...prefs, dietary_restrictions: v })}
          suggestions={COMMON_DIETS}
        />

        {/* Household Size */}
        <div>
          <label className="block text-sm font-medium mb-2">Household Size</label>
          <input
            type="number"
            min="1"
            max="20"
            value={prefs.household_size}
            onChange={e => setPrefs({ ...prefs, household_size: parseInt(e.target.value) || 1 })}
            className="w-24 bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
          />
        </div>

        {/* Skill Level */}
        <div>
          <label className="block text-sm font-medium mb-2">Cooking Skill Level</label>
          <div className="flex gap-2">
            {SKILL_LEVELS.map(level => (
              <button
                key={level}
                onClick={() => setPrefs({ ...prefs, skill_level: level })}
                className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors cursor-pointer ${
                  prefs.skill_level === level
                    ? 'bg-accent text-bg font-medium'
                    : 'bg-card border border-border text-muted hover:text-text'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Cook Days */}
        <div>
          <label className="block text-sm font-medium mb-2">Cook Days</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(day => {
              const active = prefs.cook_days.includes(day);
              return (
                <button
                  key={day}
                  onClick={() =>
                    setPrefs({
                      ...prefs,
                      cook_days: active
                        ? prefs.cook_days.filter(d => d !== day)
                        : [...prefs.cook_days, day],
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                    active
                      ? 'bg-accent text-bg font-medium'
                      : 'bg-card border border-border text-muted hover:text-text'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grocery Day */}
        <div>
          <label className="block text-sm font-medium mb-2">Grocery Day</label>
          <select
            value={prefs.grocery_day || ''}
            onChange={e => setPrefs({ ...prefs, grocery_day: e.target.value || null })}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
          >
            <option value="">Not set</option>
            {DAYS.map(day => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </div>

        {/* Cook Reminder Time */}
        <div>
          <label className="block text-sm font-medium mb-2">Cook Reminder Time</label>
          <input
            type="time"
            value={prefs.cook_reminder_time}
            onChange={e => setPrefs({ ...prefs, cook_reminder_time: e.target.value })}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50"
          />
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3 pb-8">
          <button
            onClick={save}
            disabled={saving}
            className="bg-accent text-bg font-medium rounded-xl px-6 py-3 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
          {saved && (
            <span className="text-sm text-success">Saved!</span>
          )}
        </div>
      </div>
    </div>
  );
}
