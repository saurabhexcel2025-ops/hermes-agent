## Summary

- SQLite is the source of truth for agent profiles (including Bob/default root), skills catalog, `platform_toolsets`, and `disabled_skills`.
- Operations → Tools is redesigned around per-profile Hermes toolsets; legacy Register Tool / `tool_plugins` is removed.
- Missions support `suggested_toolsets` as prompt hints with a profile-filtered picker; runtime tools still come from the mission profile config.
- Single migration **`002_profiles_tools_parity.sql`** upgrades schema v2 → v3; fresh installs use squashed **`001_baseline.sql`** at v3.
- `npm run db:seed` runs `import-hermes-state` then `seed-catalog --merge` when `HERMES_HOME` is present.

## Architecture

- **UI → SQLite → push → `~/.hermes`**: Tools and Agents pages edit SQLite; push writes behaviour files and `config.yaml` on disk.
- **Hydration**: `hydratePlatformToolsetsForSlug()` resolves DB JSON → parsed yaml → seed pack, normalizes, optionally persists.
- **Mission tool hints** do not override runtime toolsets; they only influence the composed prompt.

## Database

- **Schema version:** 3 (`BASELINE_SCHEMA_VERSION` in `src/lib/db/upgrade.ts`).
- **`002_profiles_tools_parity.sql`:** profile columns, `agent_root`, `skills` SoT, `missions.suggested_toolsets`, `catalog_templates.suggested_toolsets`, drops `tool_plugins`.
- **Fresh install:** baseline only. **Upgrade from `main`:** `npm run db:migrate` applies `002` once.

## Breaking / operator actions

```bash
npm run db:migrate
npm run db:seed
```

Then **Operations → Tools** — Pull/Push per profile after disk or UI edits. No migration of `tool_plugins` data (table dropped).

**Env:** `HERMES_HOME`, `CH_DATA_DIR` (see `docs/ENV_REFERENCE.md`).

## Areas touched

| Area | Changes |
|------|---------|
| DB | `001_baseline.sql`, `002_profiles_tools_parity.sql`, `upgrade.ts`, `migrate-db.mjs`, `prebuild-db.mjs`, `db.ts` |
| API | `/api/agent/profiles/[id]/toolsets`, profiles list `toolsCount`, config file PUT normalization, `/api/tools` POST → 410 |
| UI | Operations → Tools, Missions `ToolsetSelector`, drift banners |
| Lib | `hydratePlatformToolsetsForSlug`, `hermes-toolset-normalize`, removed `tool-registry.ts` |
| Scripts | `import-hermes-state --pull`, seed pipeline |
| Docs | `TOOLS_AND_MISSIONS.md`, `MIGRATION.md`, `API.md`, walkthrough |
| Tests | 554 unit tests; toolsets API, pull normalize, ToolsetSelector, seed pack toolsets |

## Test plan

- [x] `npm run lint && npm test && npm run build`
- [ ] `npm run db:migrate` on empty and v2-style `CH_DATA_DIR`
- [ ] `npx tsx scripts/tooling/import-hermes-state.ts` and `npm run db:seed`
- [ ] API: `GET/PUT /api/agent/profiles/{default,creative-lead}/toolsets`, sync pull/push
- [ ] UI: Operations → Tools (Creative Lead non-empty toolsets), Missions toolset picker scoped to profile
- [ ] `PLAYWRIGHT_SMOKE=1 npm run test:e2e` (optional)
