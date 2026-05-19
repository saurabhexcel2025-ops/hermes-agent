# Control Hub (Hermes)

A command-centre [Next.js](https://nextjs.org/) dashboard for [Hermes Agent](https://github.com/NousResearch/hermes-agent): missions, cron, sessions, memory, config, skills, tools, and REST APIs under `src/app/api/`.

**Documentation:** [Doc index](docs/README.md) · [Control Hub overview](docs/CONTROL_HUB.md) · [Contributing](docs/CONTRIBUTING.md) · [Testing](docs/TESTING.md) · [Support](docs/SUPPORT.md) · [Security](docs/SECURITY.md) · [Code of Conduct](docs/CODE_OF_CONDUCT.md) · [API](docs/API.md) · [Deploy](docs/DEPLOY.md) · [Migration](docs/MIGRATION.md) · [Hermes config checklist](docs/HERMES_CONFIG_INTEGRATION.md) · [Platform vision](docs/PLATFORM_VISION.md) · [Changelog](CHANGELOG.md)

---

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Live stats, active missions, system health, mission dispatch |
| **Missions** | Templates and custom templates ([CONTROL_HUB](docs/CONTROL_HUB.md)) |
| **Agent profiles** | QA, DevOps, and SWE-style profiles |
| **Cron manager** | Agent cron (`jobs.json`) plus system cron under `CH_*` paths ([API](docs/API.md)) |
| **Agent behaviour** | Profile-centric editor, personalities, behaviour files |
| **Config editor** | YAML sections driven by `src/lib/config-schema.ts` (29 sections) + HERMES.md + `.env` viewer |
| **Session browser** | Conversation transcripts |
| **Memory** | Hindsight (semantic) or Holographic (structured) |
| **Personalities / skills / tools** | Profile-aware management |
| **Gateway / logs** | Connection status and log tail |
| **Story Weaver** | Rec Room interactive fiction |
| **Orchestration chat** | Gateway-backed chat under `/orchestration/chat` |

---

## Quick start

**Shell scripts require bash** (Linux, macOS, WSL, or Git Bash on Windows). Hermes Agent also offers a [native Windows installer](https://hermes-agent.nousresearch.com/docs/getting-started/installation); Control Hub bootstrap scripts are bash-only today.

```bash
git clone https://github.com/Daniel-Parke/hermes-control-hub.git
cd hermes-control-hub
bash scripts/bootstrap/setup.sh    # PORT + .env.local, npm install, build; see script header
npm run dev              # http://localhost:<PORT> from .env.local (setup picks 42069–42100)
```

Use `npm run dev:network` for LAN HMR (`CH_ALLOWED_DEV_ORIGINS` is set during setup).

For a full greenfield install (clone + optional Hermes + Hindsight prompt), use `bash scripts/bootstrap/install.sh` instead of setup alone.

---

## Prerequisites

- **Node.js 20+** (matches [CI](.github/workflows/ci.yml))
- **Hermes Agent** (optional for a standalone UI): the app resolves the local install from **`HERMES_HOME`** / **`AGENT_HOME`** (default `~/.hermes`).
- **Optional:** PostgreSQL + pgvector and Python for [Hindsight](docs/DEPLOY.md)—`bash scripts/bootstrap/setup-hindsight.sh`, or follow prompts in **`scripts/bootstrap/install.sh`** (full bootstrap only).

---

## Data, installs, and cron

- **`CH_DATA_DIR`** (or `CONTROL_HUB_DATA_DIR`, default `~/control-hub/data`): missions, templates, stories, SQLite (`control-hub.db`), and default locations for system-cron scripts/logs unless overridden. **Not committed**—see [.gitignore](.gitignore).
- **Hermes agent cron** lives on the **active** Hermes filesystem as `cron/jobs.json` (edited by Control Hub; Hermes runs schedules). See [PLATFORM_VISION](docs/PLATFORM_VISION.md) and [MIGRATION](docs/MIGRATION.md).
- **System cron** is separate: scripts and logs under **`CH_SCRIPTS_DIR`** / **`CH_HARDWARE_LOG_DIR`** (see [API](docs/API.md) `/api/cron/hardware`).
- Audit-style events may append to `~/.hermes/logs/ch-audit.log` when Hermes is present—see [.env.example](.env.example).

---

## Development

```bash
npm run dev              # hot reload
npm run build            # production build
npm run prebuild         # SQLite migrations (run before first E2E on a fresh CH_DATA_DIR)
npm test                 # Jest — tests/unit/
npm run build && npm run test:e2e                    # Playwright — tests/e2e/
npm run build && cross-env PLAYWRIGHT_SMOKE=1 npm run test:e2e   # smoke (CI-style)
```

Mission and template Zod schemas live in **`src/lib/schema/`**; regenerate JSON with `npm run generate:schema-json`. Full CI and **`app-routes`** / sidebar rules: [docs/TESTING.md](docs/TESTING.md).

---

## Scripts (high level)

| Script | Role |
|--------|------|
| `scripts/bootstrap/install.sh` | Clone + `scripts/bootstrap/setup.sh`, or `--in-repo`. Optional Hermes templates: `INSTALL_HERMES_PROFILE_TEMPLATES=yes` or interactive prompt when `HERMES_HOME/config.yaml` exists |
| `scripts/bootstrap/setup.sh` | `.env.local`, PORT, optional Hermes/Hindsight, `npm install`, build |
| `scripts/application/ch-deploy.sh` | **`update`** \| **`restart`** \| **`rebuild`** — single CLI / dashboard deploy entry (`POST /api/update`; pull, conditional npm, build, `db:migrate` + `db:seed`, discover-agents, restart). Options: `--branch` |
| `scripts/bootstrap/stop.sh` | Stop `next start` listeners on PORT |
| `scripts/tooling/prebuild-db.mjs` | Invoked via `npm run prebuild` |
| `scripts/tooling/discover-agents.mjs` | `npm run discover-hermes` |
| `scripts/tooling/generate-json-schema.ts` | `npm run generate:schema-json` |
| `scripts/bootstrap/backup-hermes-config.sh` | Backup `CH_DATA_DIR` (or legacy paths) |
| `scripts/bootstrap/setup-hindsight.sh` | Hindsight-only install |
| `scripts/git-hooks/pre-push` | Optional: `git config core.hooksPath scripts/git-hooks` |

Preset system cron shells: **`scripts/hardware/`**. Professional profiles/templates: **`data/seed/`** (SQLite + Hermes push). Shared bash modules: **`scripts/lib/`**. Full layout: [docs/DEPLOY.md](docs/DEPLOY.md).

---

## Configuration

Control Hub reads and writes Hermes **`config.yaml`** (and related files) through the API for the local Hermes install. See [HERMES_CONFIG_INTEGRATION.md](docs/HERMES_CONFIG_INTEGRATION.md).

---

## Deployment and API

- **Deploy / TLS / Docker:** [docs/DEPLOY.md](docs/DEPLOY.md)
- **REST shapes:** [docs/API.md](docs/API.md) (`{ data?, error? }` envelope)

---

## Professional catalog (profiles + templates)

Shipped under **`data/seed/profiles/`** and **`data/seed/template-packs/`**. Control Hub SQLite is the source of truth; **`npm run db:seed`** (also run from `setup.sh` and `ch-deploy update`) upserts categories, templates, and profiles, then pushes profile trees to **`HERMES_HOME/profiles/<slug>/`**.

- **Restore defaults:** Config → Seed (`/config/seed`) or `POST /api/seed`.
- **Install-only bash copy:** optional `INSTALL_HERMES_PROFILE_TEMPLATES=yes` on non-interactive `scripts/bootstrap/install.sh` via [`scripts/lib/ch-hermes-profile-templates.sh`](scripts/lib/ch-hermes-profile-templates.sh).

---

## Repository layout (short)

| Area | Purpose |
|------|---------|
| `src/app/` | App Router pages and `api/` REST routes |
| `src/lib/` | `paths.ts`, `hermes-agent-runtime.ts`, `hermes-home.ts`, `config-schema.ts`, `schema/`, providers, utilities |
| `src/components/` | UI including `layout/sidebar-config.ts` |
| `tests/unit/` | Jest |
| `tests/e2e/` | Playwright (keep `app-routes.ts` aligned with the sidebar) |
| `docs/` | Technical and community documentation |
| `data/seed/` | Professional profiles + template packs (see [docs/CATALOG_AND_PROFILES.md](docs/CATALOG_AND_PROFILES.md)) |
| `scripts/` | `bootstrap/`, `application/ch-deploy.sh`, `tooling/`, `lib/`, `hardware/`, `git-hooks/` |

For a fuller tree and agent rules, see [AGENTS.md](AGENTS.md).

---

## License

[MIT](LICENSE)
