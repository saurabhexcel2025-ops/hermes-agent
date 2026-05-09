# Control Hub Migrations

## 2026-04 — Default Mission Data Directory

**Change:** Control Hub now stores missions, templates, operations, stories, and Rec Room data under **`$HOME/control-hub/data/`** by default (unless **`CH_DATA_DIR`** or **`CONTROL_HUB_DATA_DIR`** is set). The previous default was **`$HERMES_HOME/control-hub/data/`** (typically `~/.hermes/control-hub/data/`).

**Why:** Nested Hermes cron (`mark_job_run`) updates mission JSON under `$HOME/control-hub/data/missions/`. Aligning CH’s default avoids silent misses when Hermes posts results back to disk.

**If you already have data under `~/.hermes/control-hub/data/`:**

1. Move or symlink the tree to the new location, for example:
   - `mkdir -p ~/control-hub/data`
   - `mv ~/.hermes/control-hub/data/* ~/control-hub/data/`
2. Or set **`CH_DATA_DIR`** to your existing absolute path (no move required), for example in `.env.local`:
   - `CH_DATA_DIR=/home/you/.hermes/control-hub/data`

**Cron repeat:** Recurring jobs created by CH use **`repeat.times: null`** for “run forever”, matching Hermes’ canonical form.

## Active Hermes installs (`agents-registry.json`)

**Current behaviour:** Under **`CH_DATA_DIR`**, Control Hub persists **`agents-registry.json`** (active agent id + registered Hermes filesystem roots). API routes and the UI resolve Hermes paths via **`getActiveHermesPaths()`**, not a single implicit **`HERMES_HOME`** at runtime.

**If you only ever used env vars:** On first run, the registry is **seeded** from **`AGENT_HOME`** or **`HERMES_HOME`** when the file does not exist. After that, prefer switching installs from **Agents** in the UI or **`POST /api/agent/active`** so every surface stays consistent.

**Backups:** Include **`CH_DATA_DIR/agents-registry.json`** with the rest of `CH_DATA_DIR` so active-install choice survives restores. See [CONTROL_HUB.md](CONTROL_HUB.md) and [DEPLOY.md](DEPLOY.md).
