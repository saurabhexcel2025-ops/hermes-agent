# Deprecated

Profile templates moved to **`data/seed/profiles/`**. Control Hub seeds the SQLite `agent_profiles` table and pushes to Hermes via `npm run db:seed` / `ch-deploy update`.

This directory is retained only for reference; bash install uses `data/seed/profiles/` (see `scripts/lib/ch-hermes-profile-templates.sh`).
