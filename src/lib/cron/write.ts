// ═══════════════════════════════════════════════════════════════
// cron/write.ts — create/update/delete cron jobs in SQLite
// ═══════════════════════════════════════════════════════════════

import { db, uuid, now } from "../db";
import { parseSchedule } from "../utils";

import type { CronJobRecord, CronJobRow, CreateCronJobInput, UpdateCronJobInput } from "./types";
import { getCronJob } from "./read";

export function parseScheduleToJson(
  schedule: string
): { scheduleJson: string; scheduleDisplay: string } {
  const parsed = parseSchedule(schedule);
  return {
    scheduleJson:
      typeof parsed === "object"
        ? JSON.stringify(parsed)
        : JSON.stringify({ kind: parsed }),
    scheduleDisplay: typeof parsed === "object" && "display" in parsed
      ? (parsed.display as string)
      : schedule,
  };
}

/** Serialize repeat for SQLite storage (exported for tests). */
export function parseRepeatJson(
  repeat?: { times: number | null; completed?: number }
): string {
  if (repeat === undefined) {
    return JSON.stringify({ times: 1, completed: 0 });
  }
  return JSON.stringify({
    times: repeat.times === undefined ? 1 : repeat.times,
    completed: repeat.completed ?? 0,
  });
}

export function createCronJob(input: CreateCronJobInput): CronJobRecord {
  const id = uuid();
  const ts = now();
  const sched = parseScheduleToJson(input.schedule);

  const row: CronJobRow = {
    id,
    name: input.name.trim(),
    prompt: input.prompt ?? "",
    skills: JSON.stringify(input.skills ?? []),
    model: input.model ?? "",
    provider: input.provider ?? "",
    base_url: input.base_url ?? null,
    schedule: sched.scheduleJson,
    schedule_display: input.schedule_display ?? sched.scheduleDisplay,
    repeat_json: parseRepeatJson(input.repeat),
    enabled: input.enabled !== false ? 1 : 0,
    state: input.state ?? "scheduled",
    deliver: input.deliver ?? "none",
    script: input.script ?? null,
    profile_name: input.profile_name ?? "default",
    hermes_job_id: input.hermes_job_id ?? null,
    source: input.source ?? "ch",
    orphan: 0,
    next_run_at: null,
    last_run_at: null,
    last_status: null,
    last_delivery_error: null,
    created_at: ts,
    updated_at: ts,
    workdir: input.workdir ?? "",
  };

  db()
    .prepare(
      `INSERT INTO cron_jobs (
        id, name, prompt, skills, model, provider, base_url,
        schedule, schedule_display, repeat_json, enabled, state, deliver, script,
        profile_name, hermes_job_id, source, orphan, next_run_at, last_run_at,
        last_status, last_delivery_error, created_at, updated_at, workdir
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.name,
      row.prompt,
      row.skills,
      row.model,
      row.provider,
      row.base_url,
      row.schedule,
      row.schedule_display,
      row.repeat_json,
      row.enabled,
      row.state,
      row.deliver,
      row.script,
      row.profile_name,
      row.hermes_job_id,
      row.source,
      row.orphan,
      row.next_run_at,
      row.last_run_at,
      row.last_status,
      row.last_delivery_error,
      row.created_at,
      row.updated_at,
      row.workdir,
    );

  return getCronJob(id)!;
}

export function updateCronJob(
  id: string,
  input: UpdateCronJobInput
): CronJobRecord | null {
  const existing = getCronJob(id);
  if (!existing) return null;

  const ts = now();
  const sets: string[] = ["updated_at = ?"];
  const vals: unknown[] = [ts];

  if (input.name !== undefined) {
    sets.push("name = ?");
    vals.push(input.name.trim());
  }
  if (input.prompt !== undefined) {
    sets.push("prompt = ?");
    vals.push(input.prompt);
  }
  if (input.skills !== undefined) {
    sets.push("skills = ?");
    vals.push(JSON.stringify(input.skills));
  }
  if (input.model !== undefined) {
    sets.push("model = ?");
    vals.push(input.model);
  }
  if (input.provider !== undefined) {
    sets.push("provider = ?");
    vals.push(input.provider);
  }
  if (input.base_url !== undefined) {
    sets.push("base_url = ?");
    vals.push(input.base_url);
  }
  if (input.schedule !== undefined) {
    const parsed = parseScheduleToJson(input.schedule);
    sets.push("schedule = ?", "schedule_display = ?");
    vals.push(parsed.scheduleJson, parsed.scheduleDisplay);
  }
  if (input.schedule_display !== undefined) {
    sets.push("schedule_display = ?");
    vals.push(input.schedule_display);
  }
  if (input.repeat !== undefined) {
    sets.push("repeat_json = ?");
    vals.push(parseRepeatJson(input.repeat));
  }
  if (input.enabled !== undefined) {
    sets.push("enabled = ?");
    vals.push(input.enabled ? 1 : 0);
  }
  if (input.state !== undefined) {
    sets.push("state = ?");
    vals.push(input.state);
  }
  if (input.deliver !== undefined) {
    sets.push("deliver = ?");
    vals.push(input.deliver);
  }
  if (input.script !== undefined) {
    sets.push("script = ?");
    vals.push(input.script);
  }
  if (input.profile_name !== undefined) {
    sets.push("profile_name = ?");
    vals.push(input.profile_name);
  }
  if (input.next_run_at !== undefined) {
    sets.push("next_run_at = ?");
    vals.push(input.next_run_at);
  }
  if (input.last_run_at !== undefined) {
    sets.push("last_run_at = ?");
    vals.push(input.last_run_at);
  }
  if (input.last_status !== undefined) {
    sets.push("last_status = ?");
    vals.push(input.last_status);
  }
  if (input.last_delivery_error !== undefined) {
    sets.push("last_delivery_error = ?");
    vals.push(input.last_delivery_error);
  }
  if (input.hermes_job_id !== undefined) {
    sets.push("hermes_job_id = ?");
    vals.push(input.hermes_job_id);
  }
  if (input.orphan !== undefined) {
    sets.push("orphan = ?");
    vals.push(input.orphan ? 1 : 0);
  }
  if (input.workdir !== undefined) {
    sets.push("workdir = ?");
    vals.push(input.workdir ?? null);
  }

  vals.push(id);
  db()
    .prepare(`UPDATE cron_jobs SET ${sets.join(", ")} WHERE id = ?`)
    .run(...vals);

  return getCronJob(id);
}

export function deleteCronJob(id: string): boolean {
  const result = db()
    .prepare("DELETE FROM cron_jobs WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

/** Delete a cron job by its Hermes job id. */
export function deleteCronJobByHermesId(hermes_job_id: string): boolean {
  const result = db()
    .prepare("DELETE FROM cron_jobs WHERE hermes_job_id = ?")
    .run(hermes_job_id);
  return result.changes > 0;
}
