-- ============================================================
-- control-hub.db — Migration 006: Models + Credentials Registry
-- ============================================================
-- SQLite-backed registry for user-managed LLM models and provider
-- credentials. Drives mission dispatch, generic LLM calls, the Hindsight
-- bridge, and write-through to ~/.hermes/.env + ~/.hermes/config.yaml.
--
-- Design notes:
-- - api_key stored in plaintext (matches ~/.hermes/.env posture; no
--   app-level encryption per design constraints).
-- - 12 boolean is_default_<task> columns covering every task slot Hermes
--   surfaces (`agent` plus the 11 auxiliary slots from config v17+).
-- - Partial unique indexes enforce one default per task type at the DB
--   layer.
-- - Provider is NOT constrained at the SQL layer; validation lives in
--   the API routes (PR 4) so that adding a new provider is a single
--   src/lib/hermes-providers.ts change.

CREATE TABLE IF NOT EXISTS _mg6_guard (x INTEGER);
DROP TABLE IF EXISTS _mg6_guard;

-- ── credentials ─────────────────────────────────────────────
CREATE TABLE credentials (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  provider    TEXT NOT NULL,
  api_key     TEXT NOT NULL,
  key_hint    TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_credentials_provider ON credentials(provider);

-- ── models ──────────────────────────────────────────────────
CREATE TABLE models (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  provider        TEXT NOT NULL,
  model_id        TEXT NOT NULL,
  base_url        TEXT,
  context_length  INTEGER,
  credentials_id  TEXT REFERENCES credentials(id) ON DELETE SET NULL,

  is_default_agent              INTEGER NOT NULL DEFAULT 0 CHECK (is_default_agent              IN (0, 1)),
  is_default_hindsight          INTEGER NOT NULL DEFAULT 0 CHECK (is_default_hindsight          IN (0, 1)),
  is_default_compression        INTEGER NOT NULL DEFAULT 0 CHECK (is_default_compression        IN (0, 1)),
  is_default_vision             INTEGER NOT NULL DEFAULT 0 CHECK (is_default_vision             IN (0, 1)),
  is_default_web_extract        INTEGER NOT NULL DEFAULT 0 CHECK (is_default_web_extract        IN (0, 1)),
  is_default_session_search     INTEGER NOT NULL DEFAULT 0 CHECK (is_default_session_search     IN (0, 1)),
  is_default_title_generation   INTEGER NOT NULL DEFAULT 0 CHECK (is_default_title_generation   IN (0, 1)),
  is_default_skills_hub         INTEGER NOT NULL DEFAULT 0 CHECK (is_default_skills_hub         IN (0, 1)),
  is_default_mcp                INTEGER NOT NULL DEFAULT 0 CHECK (is_default_mcp                IN (0, 1)),
  is_default_triage_specifier   INTEGER NOT NULL DEFAULT 0 CHECK (is_default_triage_specifier   IN (0, 1)),
  is_default_approval           INTEGER NOT NULL DEFAULT 0 CHECK (is_default_approval           IN (0, 1)),
  is_default_delegation         INTEGER NOT NULL DEFAULT 0 CHECK (is_default_delegation         IN (0, 1)),

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_models_provider    ON models(provider);
CREATE INDEX idx_models_credentials ON models(credentials_id);

-- ── partial unique indexes (one default per task slot) ──────
CREATE UNIQUE INDEX uniq_default_agent             ON models(is_default_agent)             WHERE is_default_agent             = 1;
CREATE UNIQUE INDEX uniq_default_hindsight         ON models(is_default_hindsight)         WHERE is_default_hindsight         = 1;
CREATE UNIQUE INDEX uniq_default_compression       ON models(is_default_compression)       WHERE is_default_compression       = 1;
CREATE UNIQUE INDEX uniq_default_vision            ON models(is_default_vision)            WHERE is_default_vision            = 1;
CREATE UNIQUE INDEX uniq_default_web_extract       ON models(is_default_web_extract)       WHERE is_default_web_extract       = 1;
CREATE UNIQUE INDEX uniq_default_session_search    ON models(is_default_session_search)    WHERE is_default_session_search    = 1;
CREATE UNIQUE INDEX uniq_default_title_generation  ON models(is_default_title_generation)  WHERE is_default_title_generation  = 1;
CREATE UNIQUE INDEX uniq_default_skills_hub        ON models(is_default_skills_hub)        WHERE is_default_skills_hub        = 1;
CREATE UNIQUE INDEX uniq_default_mcp               ON models(is_default_mcp)               WHERE is_default_mcp               = 1;
CREATE UNIQUE INDEX uniq_default_triage_specifier  ON models(is_default_triage_specifier)  WHERE is_default_triage_specifier  = 1;
CREATE UNIQUE INDEX uniq_default_approval          ON models(is_default_approval)          WHERE is_default_approval          = 1;
CREATE UNIQUE INDEX uniq_default_delegation        ON models(is_default_delegation)        WHERE is_default_delegation        = 1;
