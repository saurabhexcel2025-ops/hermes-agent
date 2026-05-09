# Deploy scripting (current layout)

Control Hub uses one shell entrypoint for deploy actions, shared by the CLI and **`POST /api/update`**.

## Entrypoint

| Path | Role |
|------|------|
| `scripts/application/ch-deploy.sh` | Subcommands: **`update`**, **`restart`**, **`rebuild`**. Flags: **`--branch NAME`**, **`--restart-only`** (update only). |

The dispatcher exports `CH_APP_DIR` / `CH_SCRIPTS_ROOT`, sources `scripts/lib/ch-deploy-impl.sh`, and loads `.env.local` via `scripts/lib/ch-dotenv-local.sh`.

## API alignment

| Surface | Behaviour |
|---------|-----------|
| **`GET /api/update`** | Branch list (`?branches=1`) and version comparison vs remote (git in Node). |
| **`POST /api/update`** | Spawns `ch-deploy` in the background (`systemd-run --user` when available, else `nohup`). Body: **`action`**: `restart` \| `rebuild` \| `update`; optional **`branch`** for `rebuild` and `update` (sanitized; defaults from **`CH_UPDATE_GIT_BRANCH`**). Gated by **`CH_ENABLE_DEPLOY_API`** and optional signing (`src/lib/api-auth.ts`). |

## Locking

Concurrent **`ch-deploy update`** runs are serialized with **`${TMPDIR:-/tmp}/ch-deploy.lock`** inside `ch-deploy-impl.sh`.

## Related paths in `scripts/`

| Directory | Role |
|-----------|------|
| `scripts/bootstrap/` | First-run **`install.sh`**, **`setup.sh`**, **`stop.sh`**, backup, Hindsight bootstrap |
| `scripts/lib/` | Shared bash modules (deploy impl, Hermes profile templates, dotenv, port helpers, …) |
| `scripts/tooling/` | **`prebuild-db.mjs`**, **`discover-agents.mjs`**, **`generate-json-schema.ts`** (also invoked via `npm run …`) |
| `scripts/hardware/` | Preset shells copied into **`CH_DATA_DIR/scripts`** during **`scripts/bootstrap/setup.sh`** |
| `scripts/bundled-profiles/` | Hermes **`SOUL.md`** / **`AGENTS.md`** templates |

Canonical operator docs: **[DEPLOY.md](../DEPLOY.md)**.

## CLI examples

```bash
bash scripts/application/ch-deploy.sh update
bash scripts/application/ch-deploy.sh update --branch dev
bash scripts/application/ch-deploy.sh restart
bash scripts/application/ch-deploy.sh rebuild --branch dev
```
