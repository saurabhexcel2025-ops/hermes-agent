-- ============================================================
-- Migration: 002_orgs
-- Adds organisations and organisation_teams tables
-- ============================================================

-- ── organisations ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  leader_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX idx_orgs_leader ON organisations(leader_id);

-- ── organisation_teams (many-to-many join) ─────────────────
-- A team can belong to multiple organisations; an org can have multiple teams.
CREATE TABLE IF NOT EXISTS organisation_teams (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, team_id)
);

CREATE INDEX idx_org_teams_org  ON organisation_teams(org_id);
CREATE INDEX idx_org_teams_team ON organisation_teams(team_id);
