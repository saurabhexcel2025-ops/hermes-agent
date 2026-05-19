# Missions

Control Hub missions are stored in SQLite (`missions` table) with optional JSON overlays under `CH_DATA_DIR/missions/`.

## Prompt model

- The UI sends **raw** `instruction` and optional `context` on dispatch/update.
- The API builds the stored `prompt` once via `buildMissionPrompt()` in `src/lib/build-mission-prompt.ts`.
- Editing uses `stripPromptSections()` to recover instruction/context from a stored prompt.

## Categories

- User-managed categories live in `mission_categories` (SQLite).
- Missions use `category_id` (nullable). Templates store `categoryId` in custom JSON.
- APIs: `GET/POST/PUT/DELETE /api/mission-categories`.
- Migration `002_mission_categories.sql` seeds **General** and **Engineering** system categories.

### Database migrations (operator)

Runtime database path: `CH_DATA_DIR/control-hub.db` (default `~/control-hub/data/control-hub.db`).

1. After deploying new code, **restart** the Control Hub process so `getDb()` runs pending migrations.
2. `npm run build` alone does **not** migrate your live DB (prebuild only touches `repo/data/`).
3. If the UI shows “No categories loaded”, on the host run:

   ```bash
   npm run db:migrate
   ```

   Ensure `CH_DATA_DIR` in `.env.local` matches where the server stores data, then restart.

4. Create categories from **Manage categories** (missions page) or the category combobox in the composer.

## Recurring missions

- Recurring missions link to `cron_jobs` via `cron_job_id`.
- Updates to prompt/schedule sync through `src/lib/mission-cron-sync.ts`.
- Cancel pauses cron; delete removes the linked cron job.

## UI

- **Compose:** right-side Sheet (`MissionCreateForm`) with category combobox and prompt preview.
- **View:** inline `MissionEditorPanel` on the mission board (no sheet scroll).
