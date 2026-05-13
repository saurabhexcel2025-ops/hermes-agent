-- ============================================================
-- control-hub.db — Migration 014: Hermes-Only (Remove Framework Scoping)
-- ============================================================
--
-- Reverts the multi-framework scaffolding from migration 012.
-- After this migration:
--   - models.framework_id column is removed
--   - model_defaults table no longer has framework_id (unique on task_type only)
--   - All existing data is preserved (rows with framework_id='*' are kept;
--     framework-specific rows are preferred over '*' per task_type)
-- ============================================================

-- ── Step 1: Remove framework_id from models ─────────────────
-- SQLite DROP COLUMN requires no indexes reference the column.
-- Migration 012 created idx_models_framework which must be dropped first.
DROP INDEX IF EXISTS idx_models_framework;
ALTER TABLE models DROP COLUMN framework_id;

-- ── Step 2: Rebuild model_defaults without framework_id ─────
-- Since SQLite cannot ALTER DROP a column or change UNIQUE constraints,
-- we rebuild the table.

-- 2a. Create the new table with the desired schema
CREATE TABLE model_defaults_new (
    id         TEXT PRIMARY KEY,
    task_type  TEXT NOT NULL,
    model_id   TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(task_type)
);

-- 2b. Migrate data: for each task_type, prefer the framework-specific row
--     over the universal ('*') row if one exists.
INSERT INTO model_defaults_new (id, task_type, model_id, created_at, updated_at)
SELECT
    d1.id,
    d1.task_type,
    d1.model_id,
    d1.created_at,
    d1.updated_at
FROM model_defaults d1
WHERE d1.framework_id != '*'
   OR NOT EXISTS (
       SELECT 1 FROM model_defaults d2
       WHERE d2.task_type = d1.task_type
         AND d2.framework_id != '*'
   );

-- 2c. Drop the old framework index, then swap the tables
DROP INDEX IF EXISTS idx_model_defaults_framework;
DROP TABLE model_defaults;
ALTER TABLE model_defaults_new RENAME TO model_defaults;
