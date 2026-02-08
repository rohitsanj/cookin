export const DB_SCHEMA_CONTEXT = `## Database Schema

### user
- phone_number TEXT (PK)
- name TEXT
- cuisine_preferences TEXT (JSON array of strings, e.g. ["Indian", "Italian"])
- dietary_restrictions TEXT (JSON array of strings)
- household_size INTEGER
- skill_level TEXT (beginner | intermediate | advanced)
- cook_days TEXT (JSON array of day names, e.g. ["Monday", "Wednesday"])
- grocery_day TEXT
- grocery_time TEXT (HH:MM)
- cook_reminder_time TEXT (HH:MM)
- timezone TEXT
- max_messages_per_day INTEGER

### saved_recipe
- id TEXT (PK, UUID)
- user_phone TEXT (FK -> user)
- recipe_name TEXT
- original_recipe_steps TEXT
- modified_recipe_steps TEXT
- ingredients TEXT (JSON array of {name, qty, unit})
- cook_time_min INTEGER
- cuisine TEXT
- user_rating INTEGER (1-5)
- notes TEXT
- times_cooked INTEGER
- last_cooked TEXT (date)
- is_favorite INTEGER (0 or 1)

### meal_plan
- id TEXT (PK, UUID)
- user_phone TEXT (FK -> user)
- week_start TEXT (date)
- status TEXT (draft | confirmed | completed)

### planned_meal
- id TEXT (PK, UUID)
- meal_plan_id TEXT (FK -> meal_plan)
- day TEXT (e.g. Monday)
- meal_type TEXT (breakfast | lunch | dinner)
- recipe_name TEXT
- recipe_steps TEXT
- ingredients TEXT (JSON array of {name, qty, unit})
- cook_time_min INTEGER
- status TEXT (pending | cooked | skipped)
- user_rating INTEGER (1-5)
- user_comment TEXT
- is_favorite INTEGER (0 or 1)

### grocery_list
- id TEXT (PK, UUID)
- meal_plan_id TEXT (FK -> meal_plan)
- items TEXT (JSON array of {name, qty, unit, section})
- sent_at TEXT (datetime)
- fulfilled INTEGER (0 or 1)`;
