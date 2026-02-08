CREATE TABLE user (
  phone_number         TEXT PRIMARY KEY,
  name                 TEXT,
  cuisine_preferences  TEXT DEFAULT '[]',
  dietary_restrictions TEXT DEFAULT '[]',
  household_size       INTEGER DEFAULT 1,
  skill_level          TEXT DEFAULT 'beginner',
  cook_days            TEXT DEFAULT '[]',
  grocery_day          TEXT,
  grocery_time         TEXT DEFAULT '09:00',
  cook_reminder_time   TEXT DEFAULT '17:30',
  timezone             TEXT DEFAULT 'America/Los_Angeles',
  max_messages_per_day INTEGER DEFAULT 3,
  conversation_state   TEXT DEFAULT 'new',
  state_context        TEXT DEFAULT '{}',
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now'))
);

CREATE TABLE inventory_item (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_phone   TEXT NOT NULL REFERENCES user(phone_number),
  item_name    TEXT NOT NULL,
  category     TEXT,
  quantity     TEXT,
  is_staple    INTEGER DEFAULT 0,
  last_updated TEXT DEFAULT (datetime('now')),
  UNIQUE(user_phone, item_name)
);

CREATE TABLE saved_recipe (
  id                    TEXT PRIMARY KEY,
  user_phone            TEXT NOT NULL REFERENCES user(phone_number),
  recipe_name           TEXT NOT NULL,
  original_recipe_steps TEXT,
  modified_recipe_steps TEXT,
  ingredients           TEXT DEFAULT '[]',
  cook_time_min         INTEGER,
  cuisine               TEXT,
  user_rating           INTEGER,
  notes                 TEXT,
  times_cooked          INTEGER DEFAULT 0,
  last_cooked           TEXT,
  created_at            TEXT DEFAULT (datetime('now'))
);

CREATE TABLE meal_plan (
  id         TEXT PRIMARY KEY,
  user_phone TEXT NOT NULL REFERENCES user(phone_number),
  week_start TEXT NOT NULL,
  status     TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE planned_meal (
  id            TEXT PRIMARY KEY,
  meal_plan_id  TEXT NOT NULL REFERENCES meal_plan(id),
  day           TEXT NOT NULL,
  recipe_name   TEXT NOT NULL,
  recipe_steps  TEXT,
  ingredients   TEXT DEFAULT '[]',
  cook_time_min INTEGER,
  status        TEXT DEFAULT 'pending',
  user_rating   INTEGER,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE grocery_list (
  id           TEXT PRIMARY KEY,
  meal_plan_id TEXT NOT NULL REFERENCES meal_plan(id),
  items        TEXT DEFAULT '[]',
  sent_at      TEXT,
  fulfilled    INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE message_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_phone TEXT NOT NULL REFERENCES user(phone_number),
  direction  TEXT NOT NULL,
  content    TEXT,
  sent_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_inventory_user ON inventory_item(user_phone);
CREATE INDEX idx_recipe_user ON saved_recipe(user_phone);
CREATE INDEX idx_meal_plan_user ON meal_plan(user_phone, week_start);
CREATE INDEX idx_planned_meal_plan ON planned_meal(meal_plan_id);
CREATE INDEX idx_message_log_daily ON message_log(user_phone, sent_at);
