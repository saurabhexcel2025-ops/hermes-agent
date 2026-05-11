-- ============================================================
-- control-hub.db — Migration 008: Cron Jobs Registry
-- ============================================================
-- SQLite-backed registry for cron jobs, providing:
--   - CH-owned CRUD (full UI control, prompt enhancement, extra fields)
--   - Bidirectional sync with Hermes ~/.hermes/cron/jobs.json
--   - Source-of-truth: hermes_job_id links CH row to Hermes job
--   - ch_job_id on Hermes side is not needed — Hermes is append-only
--
-- Sync strategy (like models-repository):
--   - Hermes → CH: upsert by hermes_job_id (import agent-created jobs)
--   - CH → Hermes: write back via Python subprocess (cron.jobs API)
--   - On every Hermes→CH import, detect orphaned Hermes jobs (deleted in
--     Hermes but still in CH) and mark them source="hermes" orphan=true
--   - On every CH→Hermes push, clear orphaned flags
--
-- No conflict resolution needed: CH is the system of record for jobs
-- created via the dashboard. Jobs created via the agent CLI that are
-- never touched by CH remain Hermes-only and are shown in the UI
-- with source="hermes" badge.

CREATE TABLE IF NOT EXISTS _mg8_guard (x INTEGER);
DROP TABLE IF EXISTS _mg8_guard;

-- ── cron_jobs ─────────────────────────────────────────────────
-- Single table for all cron jobs regardless of source.
-- source: 'ch' = created via Control Hub dashboard
--         'hermes' = created via agent CLI / cronjob tool
-- hermes_job_id: null for CH-only jobs; set for Hermes-linked jobs
--                (both Hermes-native and CH-imported then pushed back)
-- orphan: true when Hermes-side job was deleted but CH row still exists

CREATE TABLE cron_jobs (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  prompt              TEXT NOT NULL DEFAULT '',
  skills              TEXT NOT NULL DEFAULT '[]',
  -- model/provider are optional overrides; empty = use Hermes defaults
  model               TEXT NOT NULL DEFAULT '',
  provider            TEXT NOT NULL DEFAULT '',
  base_url            TEXT,
  -- schedule stored as JSON string: { kind, minutes?, expr?, run_at?, display? }
  schedule            TEXT NOT NULL,
  schedule_display    TEXT NOT NULL DEFAULT '',
  -- repeat: JSON { times: number|null, completed: number }
  repeat_json         TEXT NOT NULL DEFAULT '{"times":1,"completed":0}',
  enabled             INTEGER NOT NULL DEFAULT 1,
  state               TEXT NOT NULL DEFAULT 'scheduled',
  deliver             TEXT NOT NULL DEFAULT 'none',
  script              TEXT,
  -- Hermes link
  hermes_job_id       TEXT UNIQUE,
  source              TEXT NOT NULL DEFAULT 'ch',
  orphan              INTEGER NOT NULL DEFAULT 0,
  -- run tracking
  next_run_at         TEXT,
  last_run_at         TEXT,
  last_status         TEXT,
  last_delivery_error TEXT,
  -- metadata
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cron_hermes_id  ON cron_jobs(hermes_job_id) WHERE hermes_job_id IS NOT NULL;
CREATE INDEX idx_cron_source     ON cron_jobs(source);
CREATE INDEX idx_cron_orphan     ON cron_jobs(orphan);
CREATE INDEX idx_cron_enabled    ON cron_jobs(enabled);
