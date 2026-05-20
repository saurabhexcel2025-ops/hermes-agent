# Hermes config integration

If you also use a separate **`hermes-config`** repo (dotfiles, extra scripts), it is **not** bundled here. This checklist keeps paths consistent with Control Hub and Hermes when both exist on a machine.

## How Control Hub resolves paths

| Variable | Role |
|----------|------|
| `HERMES_HOME` / `AGENT_HOME` | Active Hermes install root for APIs and sync (env-first). See `getHermesHome()` in [`src/lib/hermes-home.ts`](../src/lib/hermes-home.ts). |
| `getHermesDefaultRoot()` | Root for **listing** profiles (`~/.hermes` or Docker `/opt/data`), even when `HERMES_HOME` points at `.../profiles/<name>`. |
| `resolveProfileHermesHome(name)` | Full `HERMES_HOME` for a profile (used for subprocess spawns and per-profile file edits). |
| `CH_DATA_DIR` / `CONTROL_HUB_DATA_DIR` | Control Hub data root (default `~/control-hub/data`). SQLite, missions JSON, hardware scripts. |

After bootstrap/setup, [`scripts/tooling/discover-agents.mjs`](../scripts/tooling/discover-agents.mjs) writes `CH_DATA_DIR/hermes-detection.json` with `hermesHome`, `defaultRoot`, `isProfileHome`, and `hermesAgentPath` for debugging.

Legacy read-only fallback: `CH_DATA_DIR/agents-registry.json` (no longer written by Control Hub).

## What to verify in hermes-config scripts

1. **No hard-coded `~/.hermes/control-hub/data`** unless you intentionally set `CH_DATA_DIR` to that path (legacy layout).

2. **Backup/sync jobs** should include `~/control-hub/data` (or your explicit `CH_DATA_DIR`) alongside the Hermes install root (`HERMES_HOME`).

3. **Cron Python bridge** — set `HERMES_AGENT_VENV_PYTHON` or ensure `hermes-agent/cron/jobs.py` exists under `HERMES_HOME` or `~/.local/share/hermes-agent`.

4. **Config and behaviour files** that Hermes reads must exist under the resolved `HERMES_HOME` for that profile.

## Control Hub scripts in this repo

| Script | Notes |
|--------|-------|
| `scripts/bootstrap/setup.sh` | Creates `CH_DATA_DIR` directories; runs `discover-agents.mjs`. |
| `scripts/bootstrap/backup-hermes-config.sh` | Backs up `CH_DATA_DIR` when present, else legacy `HERMES_HOME/control-hub/data`. |
| `scripts/hardware/ch-backup.sh` | Uses `$HERMES_HOME` and venv discovery under `$HERMES_HOME/hermes-agent`. |

When you add or clone `hermes-config`, inventory its shell scripts and align any data paths with the table above.
