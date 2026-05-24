-- Add workdir column to cron_jobs so Hermes can be instructed to run
-- with a specific working directory (enabling AGENTS.md / .cursorrules
-- context-file discovery in the target repository).
ALTER TABLE cron_jobs ADD COLUMN workdir TEXT;
UPDATE cron_jobs SET workdir = '' WHERE workdir IS NULL;
