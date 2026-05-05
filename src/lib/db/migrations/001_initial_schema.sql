-- ============================================================
-- control-hub.db — Initial Schema
-- Version: 001
-- Description: Core tables for agent-agnostic Control Hub
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ──────────────────────────────────────────────────────────
-- Schema version tracking
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_version (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- agent_profiles
-- ============================================================
CREATE TABLE agent_profiles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'agent',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  config      TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX idx_profiles_status ON agent_profiles(status);
CREATE INDEX idx_profiles_name   ON agent_profiles(name);

-- ============================================================
-- kanban_boards
-- ============================================================
CREATE TABLE kanban_boards (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  team_id     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX idx_boards_team ON kanban_boards(team_id);

-- ============================================================
-- kanban_columns
-- ============================================================
CREATE TABLE kanban_columns (
  id          TEXT PRIMARY KEY,
  board_id    TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'cyan' CHECK (color IN ('cyan', 'purple', 'green', 'pink', 'orange')),
  position    INTEGER NOT NULL DEFAULT 0,
  wip_limit   INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX idx_cols_board ON kanban_columns(board_id);

-- ============================================================
-- kanban_cards
-- ============================================================
CREATE TABLE kanban_cards (
  id                  TEXT PRIMARY KEY,
  board_id            TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  column_id           TEXT NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  position            INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done', 'blocked')),
  assignee_profile_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  labels              TEXT NOT NULL DEFAULT '[]',
  mission_ids         TEXT NOT NULL DEFAULT '[]',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at          TEXT
);

CREATE INDEX idx_cards_board  ON kanban_cards(board_id);
CREATE INDEX idx_cards_col   ON kanban_cards(column_id);
CREATE INDEX idx_cards_assign ON kanban_cards(assignee_profile_id);

-- ============================================================
-- goal_sessions
-- ============================================================
CREATE TABLE goal_sessions (
  id                     TEXT PRIMARY KEY,
  card_id                TEXT NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  board_id               TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  mode                   TEXT NOT NULL CHECK (mode IN ('sequential', 'parallel')),
  goals                  TEXT NOT NULL DEFAULT '[]',
  current_goal_index     INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed', 'cancelled')),
  coordinator_mission_id TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at             TEXT
);

CREATE INDEX idx_goals_card  ON goal_sessions(card_id);
CREATE INDEX idx_goals_board ON goal_sessions(board_id);
CREATE INDEX idx_goals_status ON goal_sessions(status);

-- ============================================================
-- goal_steps
-- ============================================================
CREATE TABLE goal_steps (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES goal_sessions(id) ON DELETE CASCADE,
  step_index          INTEGER NOT NULL,
  goal                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'done', 'failed', 'skipped')),
  mission_id          TEXT,
  assigned_profile_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  completed_at        TEXT,
  error               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_steps_session ON goal_steps(session_id);
CREATE INDEX idx_steps_status  ON goal_steps(status);

-- ============================================================
-- teams
-- ============================================================
CREATE TABLE teams (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  leader_id   TEXT NOT NULL REFERENCES agent_profiles(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX idx_teams_leader ON teams(leader_id);

-- ============================================================
-- team_members
-- ============================================================
CREATE TABLE team_members (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id  TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('leader', 'specialist', 'reviewer', 'observer')),
  joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(team_id, profile_id)
);

CREATE INDEX idx_members_team    ON team_members(team_id);
CREATE INDEX idx_members_profile ON team_members(profile_id);

-- ============================================================
-- missions
-- ============================================================
CREATE TABLE missions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  profile_id  TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  result      TEXT,
  session_id  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX idx_missions_status   ON missions(status);
CREATE INDEX idx_missions_profile  ON missions(profile_id);
CREATE INDEX idx_missions_session  ON missions(session_id);

-- ============================================================
-- tool_plugins
-- ============================================================
CREATE TABLE tool_plugins (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'custom' CHECK (category IN ('core', 'platform', 'custom', 'mcp')),
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  config      TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE INDEX idx_tools_category ON tool_plugins(category);
CREATE INDEX idx_tools_enabled  ON tool_plugins(enabled);

-- ============================================================
-- stories
-- ============================================================
CREATE TABLE stories (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  config           TEXT NOT NULL DEFAULT '{}',
  master_prompt    TEXT,
  story_arc        TEXT,
  rolling_summary  TEXT,
  chapters         TEXT NOT NULL DEFAULT '[]',
  chapter_contents TEXT NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('generating', 'active', 'complete', 'failed')),
  generation_error TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at       TEXT
);

CREATE INDEX idx_stories_status ON stories(status);
