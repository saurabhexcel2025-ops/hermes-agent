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

## Local Hermes install resolution

**Current behaviour:** Control Hub resolves the local Hermes install path from **`HERMES_HOME`** / **`AGENT_HOME`** environment variables (default `~/.hermes`) via **`getActiveHermesPaths()`** / **`getActiveHermesHome()`** in `src/lib/hermes-agent-runtime.ts`.

**If you use env vars:** Set `HERMES_HOME` or `AGENT_HOME` to your Hermes install directory. The default is `~/.hermes`.

**Backups:** Include `CH_DATA_DIR` and your Hermes install root (`HERMES_HOME`). See [CONTROL_HUB.md](CONTROL_HUB.md) and [DEPLOY.md](DEPLOY.md).

## 2026-05 — SQLite baseline schema (v1)

**Change:** The historical migration chain (`001`–`032`) is replaced by a single **[`001_baseline.sql`](../src/lib/db/migrations/001_baseline.sql)**. Runtime schema version is **`meta.schema_version = 1`**.

**Automatic upgrade:** On first open after updating, Control Hub:

1. Backs up the existing DB to `control-hub.db.pre-baseline-<timestamp>` under `CH_DATA_DIR`
2. Recreates the database from the baseline
3. Re-imports preserved rows from the old SQLite database (see table below)
4. Overlays missions from `CH_DATA_DIR/missions/*.json` (JSON wins on duplicate mission `id`)
5. Runs idempotent Hermes registry import (`config.yaml` + `.env` → models/credentials)

**Preserved on upgrade**

| Table | Preserved |
|-------|-----------|
| `credentials` | Yes |
| `models` | Yes |
| `model_defaults` | Yes |
| `model_fallbacks` | Yes |
| `fallback_config` | Yes |
| `missions` | Yes (+ JSON overlay) |
| `cron_jobs` | Yes |
| `sessions` | Yes |
| `stories` | Yes |
| `sync_registry` | Yes |
| `gateway_platforms` | Yes |
| `tool_plugins` | Yes |

**Fresh installs / `main` branch users:** No prior SQLite DB exists; baseline is applied on first `npm run prebuild` or first API access.

**Prebuild DB:** `npm run prebuild` writes `{repo}/data/control-hub.db` using the same baseline. Runtime uses `{CH_DATA_DIR}/control-hub.db` (default `~/control-hub/data/control-hub.db`). If `{repo}/data/control-hub.db` has `schema_version !== 1`, prebuild deletes and recreates it (CI/dev convenience only).

**Removed tables:** Teams, custom kanban, and persistent goals tables are not recreated (features removed from the UI).

## Hermes pathing contract

| Root | Resolver | Holds |
|------|----------|--------|
| **Hermes** | `HERMES_HOME` / `AGENT_HOME` → legacy `agents-registry.json` (read-only) → `~/.hermes` | `config.yaml`, `.env`, `auth.json`, cron, sessions, skills, profiles |
| **Control Hub** | `CH_DATA_DIR` (default `~/control-hub/data`) | SQLite, missions JSON, templates, hardware scripts |

**Profiles:** A named profile is a full Hermes home at `{defaultRoot}/profiles/<name>`. You may also set `HERMES_HOME` directly to that profile directory (profile-as-home). Control Hub uses `getHermesDefaultRoot()` and `resolveProfileHermesHome()` so it does not double-nest `profiles/`.

**Missions:** Keep mission JSON under `CH_DATA_DIR/missions/` so Hermes `mark_job_run` can update status without writing under `HERMES_HOME`.

**Detection:** `scripts/tooling/discover-agents.mjs` writes `CH_DATA_DIR/hermes-detection.json` after setup.

## First release from `main` (checklist)

Before merging `dev` → `main` for users on file/YAML-only Control Hub:

1. Set `CH_DATA_DIR` or move existing `~/control-hub/data` (missions JSON, templates) to the default path.
2. Start Control Hub once; confirm `control-hub.db.pre-baseline-*` backup exists if you had an old SQLite DB.
3. Verify missions, models, and cron jobs in the UI match pre-upgrade expectations.
4. Run `npm test` and `PLAYWRIGHT_SMOKE=1 npm run test:e2e` (or full `navigation-matrix.spec.ts` before release).
5. Run `tests/integration/test_full_install_update_process.py` on a staging host if available.
