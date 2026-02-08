CREATE TABLE web_user (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  phone_number TEXT REFERENCES user(phone_number),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_web_user_google ON web_user(google_id);
CREATE INDEX idx_web_user_phone ON web_user(phone_number);
