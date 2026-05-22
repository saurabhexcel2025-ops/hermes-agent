// ═══════════════════════════════════════════════════════════════
// cron/hermes-sync.ts — Hermes jobs.json import/export + Python push
// ═══════════════════════════════════════════════════════════════
//
// Hermes jobs.json lives at ~/.hermes/cron/jobs.json. The Hermes cron
// scheduler (gateway subprocess) reads it directly. We write it via a
// Python subprocess that calls into hermes-agent/cron/jobs.py so we
// get the same validation, atomic writes, and path-resolution the
// scheduler uses.
//
// Hermes venv: $HERMES_HOME/hermes-agent/venv/bin/python3 (see hermes-package-path.ts)

import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { db, uuid, now } from "../db";
import { getActiveHermesPaths } from "../hermes-agent-runtime";
import { logApiError } from "../api-logger";
import {
  getHermesAgentPackageDir,
  resolveHermesAgentPackage,
  resolveHermesVenvPython,
} from "../hermes-package-path";

import type {
  CronJobRow,
  HermesJobRaw,
  ImportHermesJobResult,
  SyncResult,
} from "./types";
import { getCronJob, getCronJobByHermesId, listCronJobs } from "./read";
import { updateCronJob } from "./write";

function resolveHermesCronRuntime(hermesHome: string): {
  ok: true;
  hermesAgentPath: string;
  python: string;
} | { ok: false; error: string } {
  const hermesAgentPath = resolveHermesAgentPackage(hermesHome);
  if (!hermesAgentPath) {
    const expected = getHermesAgentPackageDir(hermesHome);
    return {
      ok: false,
      error:
        `Hermes agent package not found at ${expected} (missing cron/jobs.py). ` +
        `Install Hermes under HERMES_HOME (default ~/.hermes).`,
    };
  }
  try {
    const python = resolveHermesVenvPython(hermesHome);
    return { ok: true, hermesAgentPath, python };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Hermes jobs.json read ────────────────────────────────────

/** Read and parse Hermes jobs.json without writing. Returns raw job list. */
function readHermesJobsJson(): { jobs: HermesJobRaw[]; error?: string } {
  const paths = getActiveHermesPaths();
  const cronPath = paths.cronJobs; // = root/cron/jobs.json

  if (!existsSync(cronPath)) {
    return { jobs: [] };
  }

  try {
    const raw = readFileSync(cronPath, "utf-8");
    const data = JSON.parse(raw) as { jobs?: unknown; updated_at?: string };

    if (Array.isArray(data)) {
      return { jobs: data as HermesJobRaw[] };
    }
    if (data?.jobs && Array.isArray(data.jobs)) {
      return { jobs: data.jobs as HermesJobRaw[] };
    }
    return { jobs: [] };
  } catch (err) {
    return { jobs: [], error: String(err) };
  }
}

/** Convert a Hermes raw job to a flat row object for INSERT/UPDATE (id/updated_at set by caller). */
type HermesJobRowPartial = Omit<CronJobRow, "id" | "updated_at">;

/** Convert a Hermes raw job to a flat row object matching the cron_jobs INSERT/UPDATE shape. */
function hermesJobToRow(job: HermesJobRaw): HermesJobRowPartial {
  // Normalize schedule to JSON string
  let scheduleJson: string;
  if (typeof job.schedule === "string") {
    scheduleJson = JSON.stringify({ kind: job.schedule });
  } else if (typeof job.schedule === "object" && job.schedule !== null) {
    scheduleJson = JSON.stringify(job.schedule);
  } else {
    scheduleJson = JSON.stringify({ kind: "unknown" });
  }

  // Normalize repeat
  let repeatJson: string;
  if (typeof job.repeat === "object" && job.repeat !== null) {
    repeatJson = JSON.stringify(job.repeat);
  } else if (typeof job.repeat === "boolean") {
    repeatJson = JSON.stringify({
      times: job.repeat ? null : 1,
      completed: 0,
    });
  } else {
    repeatJson = '{"times":1,"completed":0}';
  }

  // Normalize skills
  let skills: string[];
  if (Array.isArray(job.skills)) {
    skills = job.skills;
  } else if (typeof job.skill === "string") {
    skills = [job.skill];
  } else {
    skills = [];
  }

  return {
    schedule: scheduleJson,
    repeat_json: repeatJson,
    name: job.name ?? job.id,
    prompt: job.prompt ?? "",
    skills: JSON.stringify(skills),
    model: typeof job.model === "string" ? job.model : "",
    provider: typeof job.provider === "string" ? job.provider : "",
    base_url: typeof job.base_url === "string" ? job.base_url : null,
    schedule_display: job.schedule_display ?? "",
    enabled: job.enabled !== false ? 1 : 0,
    state: job.state ?? (job.enabled !== false ? "scheduled" : "paused"),
    deliver: job.deliver ?? "none",
    script: typeof job.script === "string" ? job.script : null,
    profile_name: "default",
    hermes_job_id: job.id,
    source: "hermes",
    orphan: 0,
    next_run_at: job.next_run_at ?? null,
    last_run_at: job.last_run_at ?? null,
    last_status: job.last_status ?? null,
    last_delivery_error: job.last_delivery_error ?? null,
    created_at: job.created_at ?? new Date().toISOString(),
  };
}

// ── Hermes → CH import ────────────────────────────────────────

/**
 * Read Hermes jobs.json and upsert each job into CH SQLite.
 * Jobs already in CH (matched by hermes_job_id) are updated; new ones inserted.
 * Hermes jobs that no longer exist on disk are NOT deleted here —
 * use syncFromHermes() for full reconciliation.
 */
export function importHermesJobs(): {
  imported: ImportHermesJobResult[];
  errors: string[];
} {
  const { jobs: hermesJobs, error } = readHermesJobsJson();
  const errors: string[] = [];
  const imported: ImportHermesJobResult[] = [];

  if (error) {
    errors.push(`Failed to read Hermes jobs.json: ${error}`);
    return { imported, errors };
  }

  const hermesIds = new Set<string>();

  for (const job of hermesJobs) {
    hermesIds.add(job.id);

    const existing = getCronJobByHermesId(job.id);
    const row = hermesJobToRow(job);

    if (existing) {
      // Update — preserve CH-specific fields from existing row
      const ts = now();
      // For CH-sourced jobs, don't overwrite enabled/state — the UI controls those
      // For Hermes-sourced jobs, sync everything (they're mirrors)
      const preserveEnabledState = existing.source === "ch";
      const updateFields = preserveEnabledState
        ? `name=?, prompt=?, skills=?, model=?, provider=?, base_url=?,
            schedule=?, schedule_display=?, repeat_json=?,
            deliver=?, script=?, profile_name=?, next_run_at=?, last_run_at=?,
            last_status=?, last_delivery_error=?, updated_at=?,
            orphan=0`
        : `name=?, prompt=?, skills=?, model=?, provider=?, base_url=?,
            schedule=?, schedule_display=?, repeat_json=?, enabled=?, state=?,
            deliver=?, script=?, profile_name=?, next_run_at=?, last_run_at=?,
            last_status=?, last_delivery_error=?, updated_at=?,
            orphan=0`;
      const updateParams = preserveEnabledState
        ? [row.name, row.prompt, row.skills, row.model, row.provider, row.base_url,
           row.schedule, row.schedule_display, row.repeat_json,
           row.deliver, row.script, row.profile_name, row.next_run_at, row.last_run_at,
           row.last_status, row.last_delivery_error, ts]
        : [row.name, row.prompt, row.skills, row.model, row.provider, row.base_url,
           row.schedule, row.schedule_display, row.repeat_json, row.enabled, row.state,
           row.deliver, row.script, row.profile_name, row.next_run_at, row.last_run_at,
           row.last_status, row.last_delivery_error, ts];
      db()
        .prepare(
          `UPDATE cron_jobs SET ${updateFields}
          WHERE hermes_job_id=?`
        )
        .run(...updateParams, job.id);
      imported.push({ id: existing.id, action: "updated", hermes_job_id: job.id });
    } else {
      // Insert new
      const id = uuid();
      const ts = now();
      db()
        .prepare(
          `INSERT INTO cron_jobs (
            id, name, prompt, skills, model, provider, base_url,
            schedule, schedule_display, repeat_json, enabled, state, deliver, script,
            profile_name, hermes_job_id, source, orphan, next_run_at, last_run_at,
            last_status, last_delivery_error, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
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
          ts
        );
      imported.push({ id, action: "inserted", hermes_job_id: job.id });
    }
  }

  // Mark Hermes-only jobs (source=hermes, no longer on disk) as orphans
  db()
    .prepare(
      `UPDATE cron_jobs SET orphan=1, updated_at=? WHERE source='hermes' AND hermes_job_id IS NOT NULL AND hermes_job_id NOT IN (${hermesJobs.map(() => "?").join(",")})`
    )
    .run(now(), ...Array.from(hermesIds));

  return { imported, errors };
}

// ── Python script template ─────────────────────────────────

const _tpl = `
import sys
import os
sys.path.insert(0, %(hermes_agent_path)r)

# Set HERMES_HOME so the cron module resolves paths correctly
os.environ["HERMES_HOME"] = %(hermes_home)r

from cron.jobs import load_jobs, save_jobs, create_job, update_job, remove_job
import json

action = sys.argv[1] if len(sys.argv) > 1 else None
hermes_home = %(hermes_home)r

if action == "write_all":
    # Write all CH jobs back to Hermes jobs.json (full replacement)
    all_jobs = []
    for row in json.loads(sys.stdin.read()):
        job = dict(row)
        try:
            sched = json.loads(job.pop("schedule"))
        except Exception:
            sched = {"kind": job.get("schedule_display", job.get("schedule", "* * * * *"))}
        job["schedule"] = sched
        try:
            job["repeat"] = json.loads(job.pop("repeat_json"))
        except Exception:
            job["repeat"] = {"times": 1, "completed": 0}
        all_jobs.append(job)

    existing = {j["id"]: j for j in load_jobs()}
    for job in all_jobs:
        existing[job["id"]] = job

    hermes_ids = {j["id"] for j in all_jobs}
    for eid in list(existing.keys()):
        if eid not in hermes_ids:
            del existing[eid]

    save_jobs(list(existing.values()))
    print("ok")
elif action == "create":
    import uuid
    job_def = json.loads(sys.stdin.read())
    job_id = job_def.get("id") or uuid.uuid4().hex[:12]
    # Extract cron expression string from schedule JSON
    # parseSchedule produces: {"kind":"cron","expr":"*/30 * * * *","display":"..."}
    try:
        sched_raw = json.loads(job_def["schedule"])
        if isinstance(sched_raw, dict):
            # Accept expr, expression, or kind as the cron string
            job_def["schedule"] = sched_raw.get("expr") or sched_raw.get("expression") or sched_raw.get("kind") or job_def.get("schedule_display", "* * * * *")
        else:
            job_def["schedule"] = str(sched_raw)
    except Exception:
        job_def["schedule"] = job_def.get("schedule_display", "* * * * *")
    # Extract repeat int from repeat JSON
    try:
        repeat_raw = json.loads(job_def.get("repeat_json", "{}"))
        job_def["repeat"] = repeat_raw.get("times") if isinstance(repeat_raw, dict) else (repeat_raw or 1)
    except Exception:
        job_def["repeat"] = 1
    result = create_job(**{k: v for k, v in job_def.items() if v is not None and k not in (
        "name", "schedule_display", "repeat_json", "ch_job_id", "id",
        "enabled", "state", "hermes_job_id", "source", "orphan",
        "created_at", "next_run_at", "last_run_at", "last_status",
        "last_delivery_error"
    )})
    print(json.dumps({"ok": True, "job_id": result["id"]}))

elif action == "delete":
    job_id = sys.argv[2] if len(sys.argv) > 2 else None
    if not job_id:
        print(json.dumps({"ok": False, "error": "job_id required"}))
        sys.exit(1)
    existing = {j["id"]: j for j in load_jobs()}
    if job_id in existing:
        del existing[job_id]
        save_jobs(list(existing.values()))
    print(json.dumps({"ok": True}))
`;

/** Build a substituted Python script from the template. Uses split+join (ES2020-safe). */
function buildPythonScript(
  hermesAgentPath: string,
  hermesHome: string,
  _action: "write_all" | "create" | "delete"
): string {
  return _tpl
    .split("%(hermes_agent_path)r")
    .join(JSON.stringify(hermesAgentPath))
    .split("%(hermes_home)r")
    .join(JSON.stringify(hermesHome));
}

/**
 * Call Hermes Python to write all CH jobs to Hermes jobs.json.
 * CH is the system of record; Hermes file is updated to match exactly.
 */
export function syncAllJobsToHermes(): { ok: boolean; error?: string } {
  const paths = getActiveHermesPaths();
  const hermesHome = paths.root;

  const runtime = resolveHermesCronRuntime(hermesHome);
  if (!runtime.ok) return { ok: false, error: runtime.error };
  const { hermesAgentPath, python } = runtime;

  const allJobs = listCronJobs();

  const jobsForPython = allJobs.map((j) => ({
    id: j.hermes_job_id ?? j.id,
    name: j.name,
    prompt: j.prompt,
    skills: j.skills,
    model: j.model || undefined,
    provider: j.provider || undefined,
    base_url: j.base_url || undefined,
    schedule: j.schedule,
    schedule_display: j.schedule_display,
    repeat_json: JSON.stringify(j.repeat),
    enabled: j.enabled,
    state: j.state,
    deliver: j.deliver,
    script: j.script,
    profile_name: j.profile_name,
    created_at: j.created_at,
    next_run_at: j.next_run_at,
    last_run_at: j.last_run_at,
    last_status: j.last_status,
    hermes_job_id: j.hermes_job_id,
  }));

  const script = buildPythonScript(hermesAgentPath, hermesHome, "write_all");
  const tmpScript = `/tmp/ch_cron_export_${process.pid}_${Date.now()}.py`;

  try {
    writeFileSync(tmpScript, script, "utf-8");

    const result = spawnSync(python, [tmpScript, "write_all"], {
      input: JSON.stringify(jobsForPython),
      encoding: "utf-8",
      timeout: 15_000,
      killSignal: "SIGTERM",
    });

    try { unlinkSync(tmpScript); } catch { /* best-effort */ }

    if (result.status !== 0) {
      const err = result.stderr ?? result.stdout ?? "Unknown error";
      logApiError("syncAllJobsToHermes", "python write_all", new Error(String(err)));
      return { ok: false, error: String(err).slice(0, 500) };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Push a single CH job to Hermes (create or update).
 */
export function pushJobToHermes(chJobId: string): { ok: boolean; hermesJobId?: string; error?: string } {
  const job = getCronJob(chJobId);
  if (!job) return { ok: false, error: `Job not found: ${chJobId}` };

  const paths = getActiveHermesPaths();
  const hermesHome = paths.root;

  const runtime = resolveHermesCronRuntime(hermesHome);
  if (!runtime.ok) return { ok: false, error: runtime.error };
  const { hermesAgentPath, python } = runtime;

  const jobPayload = {
    id: job.hermes_job_id ?? job.id,
    name: job.name,
    prompt: job.prompt,
    skills: job.skills,
    model: job.model || undefined,
    provider: job.provider || undefined,
    base_url: job.base_url || undefined,
    schedule: job.schedule,
    schedule_display: job.schedule_display,
    repeat_json: JSON.stringify(job.repeat),
    enabled: job.enabled,
    state: job.state,
    deliver: job.deliver,
    script: job.script,
    profile_name: job.profile_name,
    created_at: job.created_at,
    next_run_at: job.next_run_at,
    last_run_at: job.last_run_at,
    last_status: job.last_status,
  };

  const tmpScript = `/tmp/ch_cron_push_${process.pid}_${Date.now()}.py`;

  const script = buildPythonScript(hermesAgentPath, hermesHome, "create");

  try {
    writeFileSync(tmpScript, script, "utf-8");

    const result = spawnSync(
      python,
      [tmpScript, "create"],
      { input: JSON.stringify(jobPayload), encoding: "utf-8", timeout: 15_000, killSignal: "SIGTERM" }
    );

    try { unlinkSync(tmpScript); } catch { /* best-effort */ }

    if (result.status !== 0) {
      return { ok: false, error: String(result.stderr ?? result.stdout).slice(0, 500) };
    }

    let parsed: { ok: boolean; job_id?: string; error?: string } = { ok: false };
    try {
      parsed = JSON.parse(result.stdout ?? "{}");
    } catch {
      /* ignore parse errors */
    }

    const hermesJobId = parsed.job_id ?? job.hermes_job_id ?? job.id;

    if (!job.hermes_job_id) {
      updateCronJob(job.id, { hermes_job_id: hermesJobId });
    }

    return { ok: true, hermesJobId };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Remove a job from Hermes jobs.json by its Hermes job id.
 */
export function removeJobFromHermes(hermesJobId: string): { ok: boolean; error?: string } {
  const paths = getActiveHermesPaths();
  const hermesHome = paths.root;

  const runtime = resolveHermesCronRuntime(hermesHome);
  if (!runtime.ok) return { ok: false, error: runtime.error };
  const { hermesAgentPath, python } = runtime;

  const tmpScript = `/tmp/ch_cron_del_${process.pid}_${Date.now()}.py`;

  const script = buildPythonScript(hermesAgentPath, hermesHome, "delete");

  try {
    writeFileSync(tmpScript, script, "utf-8");
    const result = spawnSync(python, [tmpScript, "delete", hermesJobId], {
      encoding: "utf-8",
      timeout: 15_000,
      killSignal: "SIGTERM",
    });
    try { unlinkSync(tmpScript); } catch { /* best-effort */ }

    if (result.status !== 0) {
      return { ok: false, error: String(result.stderr ?? result.stdout).slice(0, 500) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ── Bidirectional sync ────────────────────────────────────────

/**
 * Full bidirectional sync:
 *   1. Import all Hermes jobs into CH (upsert by hermes_job_id)
 *   2. Push all CH jobs back to Hermes (full overwrite)
 *
 * For jobs that exist in Hermes but not in CH: they are imported.
 * For jobs that exist in CH but not in Hermes: they are pushed.
 * For jobs deleted in Hermes but still in CH: marked orphan.
 */
export function syncCronWithHermes(): SyncResult {
  const hermesImport = importHermesJobs();

  const exportResult = syncAllJobsToHermes();
  const hermesExportErrors: string[] = exportResult.error ? [exportResult.error] : [];

  return {
    hermesImported: hermesImport.imported,
    hermesExportErrors,
    errors: [...hermesImport.errors, ...hermesExportErrors],
  };
}
