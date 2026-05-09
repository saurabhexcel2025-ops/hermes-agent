# Control Hub (Hermes)





A command centre dashboard for [Hermes Agent](https://github.com/NousResearch/hermes-agent). Monitor your agent fleet, dispatch missions, manage configurations, and control everything from one place.





**Docs:** [Doc index](docs/README.md) · [Control Hub overview](docs/CONTROL_HUB.md) · [Testing](docs/TESTING.md) · [Platform vision](docs/PLATFORM_VISION.md) · [Deploy / TLS / Docker](docs/DEPLOY.md) · [Changelog](CHANGELOG.md) · [Migration (data dir)](docs/MIGRATION.md) · [Hermes config checklist](docs/HERMES_CONFIG_INTEGRATION.md)










---





## Features





| Feature | Description |


|---------|-------------|


| **Dashboard** | Live stats, active missions, system health, collapsible mission dispatch |


| **Missions** | Built-in templates and custom templates ([docs/CONTROL_HUB.md](docs/CONTROL_HUB.md)) |


| **Agent Profiles** | QA, DevOps, and SWE specialist profiles |


| **Cron Manager** | Schedule, edit, and monitor recurring tasks (1m to 7d intervals) |


| **Agent Behaviour** | Profile-centric editor with personality selection, file editing per profile |


| **Config Editor** | Full config.yaml editing with 27 sections + HERMES.md + .env viewer |


| **Session Browser** | View conversation transcripts across all gateways |


| **Memory** | Hindsight (semantic search) or Holographic (structured facts) memory management |


| **Personalities** | Per-profile personality configuration (technical, analytical, creative, etc.) |


| **Skills Manager** | Profile-aware skills with inline toggle switches and content viewer |


| **Tools Manager** | Profile-aware toolsets with per-tool toggles per platform |


| **Gateway** | Monitor platform connections (Discord, Telegram, etc.) |


| **Logs** | Browse recent log entries for quick triage |


| **Story Weaver** | Collaborative AI fiction — create worlds, write chapters, build stories |

| **Kanban Board** | Multi-agent coordination board with drag-and-drop cards, WIP limits, per-card goal loops, and mission linkage |

| **Team Management** | Define agent teams with leader/specialist/reviewer roles, assign cards to team members, track board membership |





---





## Quick Start





```bash


# Clone and set up (golden path — writes .env.local with PORT + CH_ALLOWED_DEV_ORIGINS)


git clone https://github.com/Daniel-Parke/hermes-control-hub.git ~/control-hub


cd ~/control-hub


bash scripts/setup.sh


```





`setup.sh` will:


1. Check Node.js 18+ and pick **PORT** (first free **42069–42100** by default, or your choice)


2. Write **`.env.local`** with `PORT` and `CH_ALLOWED_DEV_ORIGINS` (for LAN `next dev` / HMR)


3. Optionally integrate **Hermes** when `~/.hermes/config.yaml` exists (standalone mode if not)


4. Install dependencies, run tests, and **`npm run build`**




**Bootstrap installer** (clones into `INSTALL_DIR`, default `~/control-hub`, then runs `setup.sh`): run `scripts/install.sh` **from outside** that directory, or after clone use **`bash scripts/install.sh --in-repo`** (same as `setup.sh`). Hermes profiles + optional Hindsight still run from `install.sh` after setup when Hermes is configured.


The dashboard URL is **`http://127.0.0.1:$PORT/`** with the `PORT` shown at the end of setup (Next.js reads **`PORT`** for `npm run dev` / `npm run start`).





### Build output vs runtime routes





`next build` may list routes from the compiled graph; **what you can open** is defined by the shipped `src/app` routes and static assets. Optional tuning (ports, data dirs) lives in **`.env.example`**. See [docs/CONTROL_HUB.md](docs/CONTROL_HUB.md).





### Port already in use (`EADDRINUSE`)





If `npm run start` fails because the port is taken, stop the old server first. **`scripts/stop.sh`** reads **`PORT`** from **`.env.local`** when unset. On Linux: `fuser -k ${PORT}/tcp` or change **`PORT`** in `.env.local` and retry.





### Resilience: Control Hub vs Hermes





- **Scheduled missions and cron jobs** live in Hermes’ `~/.hermes/cron/jobs.json`. Once written, the **Hermes** process (for example the gateway) **runs** them on its scheduler tick. The Control Hub web app is only an editor for that file plus local dashboard JSON under **`$HOME/control-hub/data/`** (override with **`CH_DATA_DIR`** or **`CONTROL_HUB_DATA_DIR`** so Hermes `mark_job_run` can update mission files in the same place). See [docs/MIGRATION.md](docs/MIGRATION.md) if you used the older default under `~/.hermes/control-hub/data/`.


- If **Control Hub (Next.js) stops**, jobs **keep firing** as long as **Hermes** is still running.


- If **Hermes stops**, nothing runs until you start Hermes again—there is no separate scheduler inside Control Hub.





### Platforms





- **Linux / macOS / WSL2 / Android (Termux):** supported.


- **Windows (native):** unsupported; use WSL2.





### Security-related environment variables





| Variable | Purpose |


|----------|---------|


| `PORT` | TCP port for Next.js; **`scripts/setup.sh`** picks first free **42069–42100** by default and writes **`.env.local`**. |


| `CH_READ_ONLY` | Set to `1` or `true` to reject writes (503). |


| `CH_ENABLE_DEPLOY_API` | Set to `false` to block `POST /api/update` even in development. In **production**, deploy is off unless you set this to `true`. |


| `CH_REQUEST_SIGNING_SECRET` | Optional: when set with signature headers, selected flows (e.g. deploy) can require signed requests — see `src/lib/api-auth.ts`. |


| `CH_UPDATE_GIT_BRANCH` | Branch for git pull/reset (default `dev`) |


| `CH_ALLOWED_DEV_ORIGINS` | Comma-separated origins allowed with Next dev (see `next.config.ts`). |


Mutating REST routes do **not** enforce `CH_API_KEY`; run Control Hub on a network you trust or behind your own proxy/access controls.





Audit-style events append JSON lines to `~/.hermes/logs/ch-audit.log`. See [.env.example](.env.example).





### Testing





```bash


npm test          # Jest — `tests/unit/`


npm run prebuild && npm run build && npm run test:e2e   # Playwright — `tests/e2e/` (prebuild migrates SQLite on fresh data dirs)


npm run build && cross-env PLAYWRIGHT_SMOKE=1 npm run test:e2e   # Playwright smoke only (CI)


```


Mission and template Zod schemas live in **`src/lib/schema/`**; see [docs/TESTING.md](docs/TESTING.md) for CI and sidebar / `app-routes` sync.





---





## Prerequisites





- **Node.js** 18+


- **Hermes Agent** (optional for standalone UI): the UI resolves the active install via **`agents-registry.json`** in **`CH_DATA_DIR`**, seeded from **`AGENT_HOME`** / **`HERMES_HOME`** (default **`~/.hermes/`**). Use **Agents** in the app to switch local installs. Run **`npm run discover-agents`** (also run from `setup.sh` / `update.sh`) to refresh **`agents.discovery.json`**. Run `hermes update` first when using Hermes.





### Optional: Hindsight Memory





For long-term memory with semantic search, install Hindsight during setup:





```bash


# During bootstrap install — answer "y" when prompted, or on an existing repo:


bash scripts/setup.sh





# Or install Hindsight only on an existing setup


bash scripts/setup-hindsight.sh


```





Hindsight requires:


- PostgreSQL with pgvector extension


- ~2GB disk for Python packages (PyTorch, transformers)


- Sudo access for PostgreSQL installation





---





## Memory Providers





Control Hub supports multiple memory backends:





| Provider | Type | Features | Setup |


|----------|------|----------|-------|


| **Hindsight** | Knowledge graph | Semantic search, reflection, entities, directives | `bash scripts/setup-hindsight.sh` |


| **Holographic** | SQLite | Structured facts, trust scoring, categories | `hermes plugins install hermes-memory-store` |


| **None** | — | No persistent memory | Default if nothing configured |





The dashboard automatically detects your configured provider and adapts the Memory page accordingly. If no provider is configured, it shows an informative notice.





---





## Agent Profiles





3 specialist profiles are created during install:





| Profile | Focus | Skills |


|---------|-------|--------|


 | QA Engineer | Testing, bug reproduction | 75 enabled |
 | DevOps Engineer | Infrastructure, CI/CD | 72 enabled |
 | SWE Engineer | Software development | 74 enabled |


Each profile has its own SOUL.md, AGENTS.md, USER.md, MEMORY.md, and skill/tool configuration. All profiles share the main agent's API keys.
Each profile has its own SOUL.md, AGENTS.md, USER.md, MEMORY.md, and skill/tool configuration. All profiles share the main agent's API keys.





---





## Scripts





| Script | Purpose |


|--------|---------|


| `install.sh` | Bootstrap clone into `INSTALL_DIR` then `setup.sh`, or **`--in-repo`** for setup-only |


| `setup.sh` | Post-clone setup: PORT + `.env.local`, optional Hermes, npm install, test, build |


| `setup-hindsight.sh` | Standalone Hindsight memory installer |


| `restart.sh` | Stop listener on **PORT** (from env or `.env.local`), `next start`, health check |


| `update.sh` | Pull from **`CH_UPDATE_GIT_BRANCH`** (default **dev**), npm install if needed, build, profiles, restart |


| `backup-hermes-config.sh` | Backup/restore Hermes config |


| `hindsight-server.py` | Hindsight memory backend server |





---





## Development





```bash


cd ~/control-hub





# Development (hot reload)


npm run dev


# Dev server on all interfaces (LAN) — still uses PORT from .env.local


npm run dev:network





# Production build


npm run build





# Start production server


npm run start:network    # LAN accessible


npm run start            # localhost only





# Run tests


npm test


```





---





## Configuration





Control Hub reads from `~/.hermes/config.yaml` — it never writes to this file directly.





Key config sections:


- `memory.provider` — Memory backend (hindsight, holographic, none)


- `plugins.hindsight` — Hindsight server configuration


- `platform_toolsets` — Which tools are available per platform


- `skills.disabled` — Skills to exclude from the prompt





---





## Deployment





```bash


# 1. Build (must pass before deploy)


cd ~/control-hub && npm run build





# 2. Kill existing server


fuser -k "${PORT:-3000}/tcp" 2>/dev/null; sleep 2





# 3. Start server (use background=true in terminal tool — NEVER use nohup ... &)


node node_modules/next/dist/bin/next start -p "${PORT:-3000}" -H 0.0.0.0


```





Or use the Update API for zero-downtime-style deploys:





```bash


# Check for updates


curl "http://127.0.0.1:${PORT:-3000}/api/update"





# Trigger update (pull + build + restart)


curl -X POST "http://127.0.0.1:${PORT:-3000}/api/update" \


  -H "Content-Type: application/json" \


  -d '{"action": "update"}'





# Restart only


curl -X POST "http://127.0.0.1:${PORT:-3000}/api/update" \


  -H "Content-Type: application/json" \


  -d '{"action": "restart"}'


```





The update endpoint uses a lock file (`/tmp/ch-deploy.lock`) to prevent concurrent deploys. Build failures abort without restarting the server.





---





## API





All API routes follow the `{ data?, error? }` envelope pattern:





```typescript


// Success


{ data: { profiles: [...] } }





// Error


{ error: "Profile not found" }


```





Error logging: all catch blocks call `logApiError(route, context, error)`.





---





## Requirements





- Node.js 20+


- Hermes Agent installed at `~/.hermes/`


- (Optional) PostgreSQL + pgvector for Hindsight memory


- (Optional) Python 3.11 + venv for Hindsight





---





## Documentation





Documentation for **Control Hub OSS** lives in the `docs/` directory:





| Document | Description |


|----------|-------------|


| [Control Hub overview](docs/CONTROL_HUB.md) | What this repository is and doc map |


| [API Reference](docs/API.md) | REST endpoints with request/response formats |


| [Contributing](docs/CONTRIBUTING.md) | Development workflow, code standards, PR checklist |


| [Platform Vision](docs/PLATFORM_VISION.md) | Architecture, goals, and design philosophy |





---





## Architecture





```


control-hub/


├── src/


│   ├── app/                    # Next.js pages + API routes


│   │   ├── api/                # REST endpoints ({ data?, error? } envelope)


│   │   ├── agent/              # Behaviour, Tools pages


│   │   ├── skills/             # Skills manager


│   │   ├── memory/             # Memory browser (provider-aware)


│   │   ├── config/             # Config editor (27+ sections)


│   │   ├── kanban/            # Kanban board (columns, cards, WIP limits)
│   │   ├── orchestration/     # Teams
│   │   │   └── teams/page.tsx # Team CRUD, member management
│   ├── missions/             # Mission dispatch + tracking


│   │   ├── cron/               # Cron job manager


│   │   ├── sessions/           # Session browser


│   │   └── recroom/            # Creative activities


│   ├── components/             # React components


│   │   ├── memory/             # HindsightBrowser, HolographicBrowser


│   │   ├── layout/             # Sidebar, PageHeader


│   │   └── ui/                 # Button, Card, Modal, Badge, etc.


│   ├── lib/                    # Shared utilities


│   │   ├── memory-providers/   # Memory provider abstraction layer


│   │   ├── config-schema.ts    # Config section definitions


│   │   ├── paths.ts            # Path constants, Hermes paths, config helpers


│   │   ├── jobs-repository.ts # Atomic jobs.json read/write (Hermes-compatible)


│   │   ├── path-security.ts    # Profile/skill path allowlisting


│   │   └── utils.ts            # timeAgo, formatBytes, parseSchedule


│   └── types/                  # TypeScript interfaces


├── scripts/                    # Shell scripts


│   ├── install.sh              # Bootstrap clone + setup, or --in-repo; optional Hindsight


│   ├── setup.sh                # Post-clone setup (npm install, build)


│   ├── setup-hindsight.sh      # Standalone Hindsight installer


│   ├── restart.sh              # Safe server restart (no nohup)


│   ├── update.sh               # Git pull + build + restart


│   └── backup-hermes-config.sh # Config backup


└── data/                       # Mission + template JSON files


```





---





## License





MIT


