# Professional catalog seeds (shipped with Control Hub)

This directory is **version-controlled**. Runtime SQLite lives under `CH_DATA_DIR` (typically `~/control-hub/data`), not here.

| Path | Purpose |
|------|---------|
| `profiles/manifest.json` | Six professional agent profiles |
| `profiles/<slug>/` | `SOUL.md`, `AGENTS.md`, `config.yaml` per profile |
| `template-packs/control-hub-professional-v1.json` | Mission templates for the composer |

## Apply seeds

```bash
npm run db:migrate
npm run db:seed          # merge (skip existing seeded rows)
npm run db:seed -- --replace   # via: npx tsx scripts/tooling/seed-catalog.ts --replace
```

Or use **Config → Seed** in the UI (`/config/seed`).

## Regenerate from bundled legacy templates

```bash
node scripts/tooling/generate-seed-pack.mjs
```
