ALTER TABLE planned_meal ADD COLUMN user_comment TEXT;
ALTER TABLE planned_meal ADD COLUMN is_favorite INTEGER DEFAULT 0;
ALTER TABLE saved_recipe ADD COLUMN is_favorite INTEGER DEFAULT 0;
