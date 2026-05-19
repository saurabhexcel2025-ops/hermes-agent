# API Reference

All API routes return the envelope:

```typescript
{ data?: T; error?: string }
```

All error handlers must call `logApiError(route, context, error)` from `@/lib/api-logger`.

## Route Inventory

| Route | Methods | Purpose |
|---|---|---|
| `/api/agent/files` | `GET` | List agent behavior files. |
| `/api/agent/files/[key]` | `GET`, `PUT` | Read/update one behavior file. |
| `/api/agent/personality` | `PUT` | Update selected personality config. |
| `/api/agent/profiles` | `GET`, `POST`, `PUT`, `DELETE` | Professional profiles (SQLite source of truth; includes per-row `syncStatus`). |
| `/api/agent/profiles/[id]` | `GET`, `PUT`, `DELETE` | One professional profile. |
| `/api/agent/profiles/sync/drift` | `GET` | Drift report for all DB profiles vs Hermes disk. |
| `/api/agent/profiles/sync/push` | `POST` | Push profile(s) from DB to `HERMES_HOME/profiles/<slug>/` (`{ slug }` or `{ all: true }`). |
| `/api/agent/profiles/sync/pull` | `POST` | Pull one profile from Hermes disk into DB (`{ slug }` required). |
| `/api/seed` | `GET`, `POST` | Read seed state / run catalog seed (`target`, `mode`, optional `slug` / `templateId`). |
| `/api/agents` | `GET` | Inspect running Hermes agent processes (OS-dependent). |
| `/api/config` | `GET`, `PUT` | Read/update parsed config content. |
| `/api/credentials` | `GET`, `POST` | API key credentials (masked list). |
| `/api/credentials/[id]` | `GET`, `PUT`, `DELETE` | One credential. |
| `/api/cron` | `GET`, `POST`, `PUT`, `DELETE` | Manage **agent** cron jobs (Hermes `jobs.json` for the active install). |
| `/api/cron/hardware` | `GET`, `POST`, `PUT`, `DELETE` | **System** cron (system crontab): scripts/logs under `CH_SCRIPTS_DIR` / `CH_HARDWARE_LOG_DIR`. |
| `/api/cron/hardware/meta` | `GET` | `{ scriptsDir, logDir }` from [`getChScriptsDir()`](../src/lib/paths.ts) / [`getChHardwareLogDir()`](../src/lib/paths.ts). |
| `/api/fs/git/branches` | `GET` | List git branches for a workspace path. |
| `/api/fs/list` | `GET` | List directory entries (path-validated). |
| `/api/gateway/health` | `GET` | Gateway health probe (`/v1/models`). |
| `/api/gateway/models` | `GET` | List models from gateway. |
| `/api/logs` | `GET` | Read recent Hermes logs. |
| `/api/memory` | `GET`, `POST`, `PUT`, `DELETE` | Manage holographic memory facts. |
| `/api/memory/hindsight` | `GET`, `POST` | Query/retain hindsight memory records. |
| `/api/missions` | `GET`, `POST`, `PUT`, `DELETE` | Mission CRUD + dispatch (SQLite). |
| `/api/missions/health` | `GET` | Mission subsystem health view. |
| `/api/models` | `GET`, `POST` | Models registry (SQLite); list / create. |
| `/api/models/[id]` | `GET`, `PUT`, `DELETE` | One model row. |
| `/api/models/[id]/diff` | `GET` | Diff model row vs Hermes config. |
| `/api/models/defaults` | `GET`, `PUT` | Default model per task slot (`agent`, `hindsight`, …). |
| `/api/models/fallbacks` | `GET`, `POST` | Fallback chain entries. |
| `/api/models/fallbacks/[id]` | `PUT`, `DELETE` | One fallback entry. |
| `/api/models/fallbacks/config` | `GET`, `PUT` | Fallback chain configuration. |
| `/api/models/fallbacks/custom` | `POST` | Add custom fallback entry. |
| `/api/models/fallbacks/import` | `POST` | Import fallbacks from Hermes. |
| `/api/models/fallbacks/reorder` | `PUT` | Reorder fallback chain. |
| `/api/models/fallbacks/sync` | `POST` | Sync fallbacks with Hermes. |
| `/api/models/fallbacks/toggle` | `PUT` | Enable/disable fallback entry. |
| `/api/models/import` | `POST` | Import models from Hermes config. |
| `/api/models/sync/drift` | `GET` | Report model drift between DB and Hermes. |
| `/api/models/sync/pull` | `POST` | Pull models from Hermes into DB. |
| `/api/models/sync/push` | `POST` | Push models from DB to Hermes. |
| `/api/monitor` | `GET` | Aggregated system monitoring snapshot. |
| `/api/orchestration/chat` | `POST` | Proxy chat to Hermes gateway. |
| `/api/personalities` | `GET`, `POST`, `PUT`, `DELETE` | Manage personality records. |
| `/api/sessions` | `GET` | List sessions with filters. |
| `/api/sessions/[id]` | `GET` | Read one session transcript. |
| `/api/skills` | `GET` | List skills inventory. |
| `/api/skills/[name]` | `GET` | Read one skill document. |
| `/api/skills/[name]/toggle` | `PUT` | Enable/disable a skill for a profile. |
| `/api/skills/[...path]` | `GET` | Read files under a skill tree. |
| `/api/status` | `GET` | Basic readiness endpoint. |
| `/api/stories` | `GET`, `POST`, `PUT`, `DELETE` | Story Weaver CRUD. |
| `/api/sync` | `GET`, `POST` | Background sync control and status. |
| `/api/templates` | `GET`, `POST`, `PUT`, `DELETE` | Mission template CRUD. |
| `/api/tools` | `GET`, `PUT` | Read/update toolset configuration. |
| `/api/update` | `GET`, `POST` | **GET** `?branch=` — compare local `HEAD` to `origin/<branch>`; `?branches=1` — branch list; **`?deploy=1`** — read `ch-deploy.status` (+ log tail on failure). **POST** `action` = `restart` \| `rebuild` \| `update`; optional `branch` (update/rebuild checkout only; rebuild omits branch = current tree). Returns **409** if a deploy is already `running`. Requires `CH_ENABLE_DEPLOY_API`. Spawns `scripts/application/ch-deploy.sh`. |

## System cron notes

Managed crontab lines must run a script **under** `scriptsDir` (default `CH_DATA_DIR/scripts`). `POST`/`PUT` reject any other command path. Preset scripts ship in repo **`scripts/hardware/`**; **`scripts/bootstrap/setup.sh`** copies any missing `*.sh` into `CH_DATA_DIR/scripts` during setup. Older crontab lines pointing elsewhere are ignored until edited or removed. See **[SYSTEM-CRON.md](SYSTEM-CRON.md)** for preset behaviour (including **`ch-backup.sh`** Hindsight snapshots via `hindsight_bridge.py`).

## Auth and Safety Notes

- **`CH_READ_ONLY`** blocks writes (503) when enabled.
- Deploy actions (`/api/update` `POST`) are gated by `CH_ENABLE_DEPLOY_API`.
- Signed request support can be enabled with `CH_REQUEST_SIGNING_SECRET`.
- Correlation IDs are accepted via `x-correlation-id` or `x-request-id`.
