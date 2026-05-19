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

## Recurring missions

- Recurring missions link to `cron_jobs` via `cron_job_id`.
- Updates to prompt/schedule sync through `src/lib/mission-cron-sync.ts`.
- Cancel pauses cron; delete removes the linked cron job.

## UI

- **Compose:** right-side Sheet (`MissionCreateForm`) with category combobox and prompt preview.
- **View:** inline `MissionEditorPanel` on the mission board (no sheet scroll).
