# Catalog and professional profiles

Control Hub ships a **professional catalog** (six agent profiles, twelve mission templates, mission categories) under version control in **`data/seed/`**. At runtime the catalog lives in **SQLite** (`CH_DATA_DIR/control-hub.db`); Hermes receives profile **trees on disk** via push sync.

## Data flow

```text
data/seed/  ──►  npm run db:seed / POST /api/seed / ch-deploy update (seed-catalog --merge)
                      │
                      ▼
              agent_profiles, catalog_templates, mission_categories
                      │
                      ▼
              POST /api/agent/profiles/sync/push  (or inline on create/save/seed)
                      │
                      ▼
              HERMES_HOME/profiles/<slug>/   (SOUL.md, AGENTS.md, config.yaml, …)
```

Hermes missions and cron use the active install’s `HERMES_HOME` and `profiles/<slug>/` when `profile_id` is set.

## Slugs

Professional profiles use short slugs aligned with the seed manifest (`qa`, `swe`, `devops`, …)—not legacy names like `qa-engineer`. The default **Bob** persona remains the Hermes **root** install (`HERMES_HOME` itself), not a row in `agent_profiles`.

## Seed operations

| Action | How |
|--------|-----|
| **Merge** (default) | Upsert missing seed rows; skip profiles/templates that already exist by `seed_key`. |
| **Replace** | Re-apply seed SQL/content for the selected target (profiles, templates, categories, or all). |
| **CLI** | `npm run db:seed` → `scripts/tooling/seed-catalog.ts --merge` |
| **UI** | Config → Seed (`/config/seed`) |
| **Deploy** | `ch-deploy update` runs `seed-catalog.ts --merge` after build |

Seed state is written to `CH_DATA_DIR/seed-state.json`.

## Sync (push / pull / drift)

| Surface | Purpose |
|---------|---------|
| **Operations → Agents** | Drift banner, Push all / Pull all, per-profile push/pull when a row is selected |
| **Config → Models** | Same pattern for LLM model registry (separate tables) |
| **Dashboard** | **Sync now** → `POST /api/sync` (background `SyncScheduler`) |

API routes: `/api/agent/profiles/sync/push`, `pull`, `drift`. Models use `/api/models/sync/*` only (per-model `[id]/push|pull` routes were removed).

## Install-only Hermes copy

Non-interactive **`scripts/bootstrap/install.sh`** may copy missing profile files from `data/seed/profiles/` when `INSTALL_HERMES_PROFILE_TEMPLATES=yes` (see `scripts/lib/ch-hermes-profile-templates.sh`). Ongoing updates rely on **seed-catalog → SQLite → push**, not bash profile sync on `ch-deploy update`.

## Authoring

- Pack layout: [`data/seed/README.md`](../data/seed/README.md)
- Validate or scaffold: `node scripts/tooling/generate-seed-pack.mjs` (optional `--scaffold <slug>`)
