-- ============================================================
-- control-hub.db — Migration 005: Mission Status Enum Unification
-- ============================================================
-- Replaces the legacy 'pending|running|completed|failed|cancelled' status
-- enum with the canonical 'queued|dispatched|successful|failed' enum used
-- by the V1 mission schema (src/lib/schema/mission-v1.ts).
--
-- Migrates existing rows:
--   pending   -> queued
--   running   -> dispatched
--   completed -> successful
--   cancelled -> failed
--   failed    -> failed (no change)
--
-- SQLite cannot ALTER a CHECK constraint in place, so we rebuild the table.

CREATE TABLE IF NOT EXISTS _mg5_guard (x INTEGER);
DROP TABLE IF EXISTS _mg5_guard;

-- 1. Create the new table with the canonical status enum
CREATE TABLE missions_new (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  profile_id   TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'dispatched', 'successful', 'failed')),
  result       TEXT,
  session_id   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT,
  local_dirs   TEXT NOT NULL DEFAULT '[]',
  references_  TEXT NOT NULL DEFAULT '[]',
  skills       TEXT NOT NULL DEFAULT '[]',
  goals        TEXT NOT NULL DEFAULT '[]'
);

-- 2. Copy + map existing rows
INSERT INTO missions_new (
  id, name, prompt, profile_id, status, result, session_id,
  created_at, updated_at, deleted_at,
  local_dirs, references_, skills, goals
)
SELECT
  id,
  name,
  prompt,
  profile_id,
  CASE status
    WHEN 'pending'   THEN 'queued'
    WHEN 'running'   THEN 'dispatched'
    WHEN 'completed' THEN 'successful'
    WHEN 'cancelled' THEN 'failed'
    WHEN 'failed'    THEN 'failed'
    ELSE 'queued'
  END,
  result,
  session_id,
  created_at,
  updated_at,
  deleted_at,
  COALESCE(local_dirs,  '[]'),
  COALESCE(references_, '[]'),
  COALESCE(skills,      '[]'),
  COALESCE(goals,       '[]')
FROM missions;

-- 3. Replace
DROP TABLE missions;
ALTER TABLE missions_new RENAME TO missions;

-- 4. Recreate indexes (mission table indexes from migration 001)
CREATE INDEX idx_missions_status  ON missions(status);
CREATE INDEX idx_missions_profile ON missions(profile_id);
CREATE INDEX idx_missions_session ON missions(session_id);
