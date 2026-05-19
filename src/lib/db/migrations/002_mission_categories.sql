-- Mission categories registry + missions.category_id

CREATE TABLE IF NOT EXISTS mission_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'cyan',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_system   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_categories_name
  ON mission_categories(lower(name));

INSERT OR IGNORE INTO mission_categories (id, name, color, sort_order, is_system)
VALUES
  ('general', 'General', 'cyan', 0, 1),
  ('engineering', 'Engineering', 'purple', 1, 1);

ALTER TABLE missions ADD COLUMN category_id TEXT REFERENCES mission_categories(id);

CREATE INDEX IF NOT EXISTS idx_missions_category ON missions(category_id);
