CREATE TABLE IF NOT EXISTS player_saves (
  telegram_id TEXT PRIMARY KEY NOT NULL,
  save_data TEXT NOT NULL CHECK (json_valid(save_data)),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
