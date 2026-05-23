// ═══════════════════════════════════════════════════════════════
// session-repository.ts — Unified session registry
//
// Control Hub is the source of truth for ALL agent sessions.
// Hermes session files on disk are synced into this table on every
// sessions API call. Agent-native sessions (mission dispatch, cron)
// are written here directly.
//
// Schema: src/lib/db/migrations/009_sessions.sql
// ═══════════════════════════════════════════════════════════════

import { db, uuid, now } from "./db";
import Database from "better-sqlite3";
import { getActiveHermesPaths } from "./hermes-agent-runtime";
import { existsSync } from "fs";
import { join } from "path";

// ── Types ────────────────────────────────────────────────────

export type AgentType = "hermes";
// Single agent type — Hermes only.
export type SessionSource = "cli" | "cron" | "mission" | "api";
export type SessionStatus = "active" | "completed" | "failed";

export interface SessionRecord {
  id: string;
  agentType: AgentType;
  source: SessionSource;
  missionId: string | null;
  profileName: string | null;
  modelId: string | null;
  provider: string | null;
  title: string | null;
  size: number;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  exitCode: number | null;
  error: string | null;
}

export interface CreateSessionInput {
  agentType?: AgentType;
  source: SessionSource;
  missionId?: string | null;
  profileName?: string | null;
  modelId?: string | null;
  provider?: string | null;
  title?: string | null;
  size?: number;
  startedAt?: string;
  status?: SessionStatus;
}

export interface UpdateSessionInput {
  endedAt?: string | null;
  status?: SessionStatus;
  exitCode?: number | null;
  error?: string | null;
  size?: number;
  title?: string | null;
}

export interface ListSessionsOptions {
  agentType?: AgentType;
  source?: SessionSource;
  missionId?: string | null;
  limit?: number;
  offset?: number;
}

// ── Row shape (internal) ─────────────────────────────────────

interface SessionRow {
  id: string;
  agent_type: string;
  source: string;
  mission_id: string | null;
  profile_name: string | null;
  model_id: string | null;
  provider: string | null;
  title: string | null;
  size: number;
  started_at: string;
  ended_at: string | null;
  status: string;
  exit_code: number | null;
  error: string | null;
}

function rowToSession(row: SessionRow | undefined): SessionRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    agentType: row.agent_type as AgentType,
    source: row.source as SessionSource,
    missionId: row.mission_id ?? null,
    profileName: row.profile_name ?? null,
    modelId: row.model_id ?? null,
    provider: row.provider ?? null,
    title: row.title ?? null,
    size: row.size,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
    status: row.status as SessionStatus,
    exitCode: row.exit_code ?? null,
    error: row.error ?? null,
  };
}

// ── CRUD ────────────────────────────────────────────────────

/**
 * Insert a new session record. Called by the dispatch pipeline when a mission
 * or cron job starts. Also called by syncHermesSessionsToDb for CLI sessions.
 */
export function createSession(input: CreateSessionInput): SessionRecord {
  const id = uuid();
  const startedAt = input.startedAt ?? now();
  const database = db();
  database.prepare(/* sql */ `
    INSERT INTO sessions (
      id, agent_type, source, mission_id, profile_name,
      model_id, provider, title, size, started_at, status
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `).run(
    id,
    input.agentType ?? "hermes",
    input.source,
    input.missionId ?? null,
    input.profileName ?? null,
    input.modelId ?? null,
    input.provider ?? null,
    input.title ?? null,
    input.size ?? 0,
    startedAt,
    input.status ?? "active",
  );
  return getSession(id)!;
}

/**
 * Update a session record. Called when a mission/cron completes or fails.
 */
export function updateSession(id: string, updates: UpdateSessionInput): SessionRecord | null {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if (updates.endedAt !== undefined) {
    sets.push("ended_at = ?");
    vals.push(updates.endedAt ?? null);
  }
  if (updates.status !== undefined) {
    sets.push("status = ?");
    vals.push(updates.status);
  }
  if (updates.exitCode !== undefined) {
    sets.push("exit_code = ?");
    vals.push(updates.exitCode ?? null);
  }
  if (updates.error !== undefined) {
    sets.push("error = ?");
    vals.push(updates.error ?? null);
  }
  if (updates.size !== undefined) {
    sets.push("size = ?");
    vals.push(updates.size);
  }
  if (updates.title !== undefined) {
    sets.push("title = ?");
    vals.push(updates.title ?? null);
  }

  if (sets.length === 0) return getSession(id);

  vals.push(id);
  db().prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return getSession(id);
}

/**
 * Fetch a single session by id.
 */
export function getSession(id: string): SessionRecord | null {
  const row = db().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | SessionRow
    | undefined;
  return rowToSession(row);
}

/**
 * List sessions with optional filters. Ordered by started_at DESC.
 */
export function listSessions(opts: ListSessionsOptions = {}): {
  sessions: SessionRecord[];
  total: number;
} {
  const { agentType, source, missionId, limit = 50, offset = 0 } = opts;
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (agentType) {
    conditions.push("agent_type = ?");
    params.push(agentType);
  }
  if (source) {
    conditions.push("source = ?");
    params.push(source);
  }
  if (missionId !== undefined) {
    conditions.push(missionId === null ? "mission_id IS NULL" : "mission_id = ?");
    if (missionId !== null) params.push(missionId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const database = db();
  const total = (
    database
      .prepare(`SELECT COUNT(*) as c FROM sessions ${where}`)
      .get(...params) as { c: number }
  ).c;

  const rows = database
    .prepare(
      `SELECT * FROM sessions ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as SessionRow[];

  return { sessions: rows.map(rowToSession).filter(Boolean) as SessionRecord[], total };
}

// ── Hermes state.db sync ──────────────────────────────────────

interface HermesSessionRow {
  id: string;
  source: string;
  model: string;
  title: string | null;
  started_at: number;
  ended_at: number | null;
  end_reason: string | null;
  message_count: number | null;
  api_call_count: number | null;
}

/**
 * Map Hermes session end_reason to our status + exit_code.
 * Hermes end_reason values: "stop", "max_iterations", "interrupt",
 * "error", "token_limit", "timeout", null (still running)
 */
function hermesStatusFromEndReason(
  end_reason: string | null,
): { status: SessionStatus; exitCode: number | null } {
  if (!end_reason) return { status: "active", exitCode: null };
  switch (end_reason) {
    case "stop":
    case "token_limit":
    case "max_iterations":
      return { status: "completed", exitCode: 0 };
    case "timeout":
    case "interrupt":
      return { status: "completed", exitCode: 143 }; // SIGTERM
    case "error":
      return { status: "failed", exitCode: 1 };
    default:
      return { status: "completed", exitCode: null };
  }
}

/**
 * Read session metadata directly from Hermes's state.db SQLite database.
 * Hermes (v0.14+) stores all sessions here instead of flat JSON files.
 */
function readHermesSessionsFromStateDb(): HermesSessionRow[] {
  const root = getActiveHermesPaths().root;
  const stateDbPath = join(root, "state.db");
  if (!existsSync(stateDbPath)) return [];

  try {
    const hermesDb = new Database(stateDbPath, { readonly: true });

    const tables = hermesDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
      .all();
    if (tables.length === 0) {
      hermesDb.close();
      return [];
    }

    const rows = hermesDb
      .prepare(
        `SELECT id, source, model, title, started_at, ended_at, end_reason, message_count, api_call_count
         FROM sessions ORDER BY started_at DESC LIMIT 5000`,
      )
      .all() as HermesSessionRow[];
    hermesDb.close();

    return rows;
  } catch {
    return [];
  }
}

/**
 * Build a map of Hermes job ID -> Control Hub mission UUID from Control Hub's
 * own cron_jobs table. This is the only correct place to look — cron_jobs
 * lives in Control Hub's control-hub.db, NOT in Hermes state.db.
 */
function buildMissionIdByJobId(): Map<string, string> {
  const missionIdByJobId = new Map<string, string>();
  try {
    const rows = db()
      .prepare("SELECT id, hermes_job_id FROM cron_jobs WHERE hermes_job_id IS NOT NULL AND hermes_job_id != ''")
      .all() as Array<{ id: string; hermes_job_id: string }>;
    for (const row of rows) {
      missionIdByJobId.set(row.hermes_job_id, row.id);
    }
  } catch {
    // cron_jobs table may not exist — non-fatal
  }
  return missionIdByJobId;
}

/**
 * Sync Hermes sessions into the sessions table.
 *
 * Reads session metadata directly from Hermes's state.db (v0.14+),
 * which is the canonical source for all Hermes-born sessions
 * (CLI, cron, API). Upserts into the sessions table so Control Hub
 * has a unified view of all agent activity.
 *
 * For cron sessions, derives mission_id by matching the embedded
 * job ID in the session title against cron_jobs.hermes_job_id
 * (which lives in Control Hub's DB, not Hermes's).
 *
 * Completed sessions in Hermes are updated to "completed"/"failed"
 * status here — their end state is always driven by Hermes.
 */
export function syncHermesSessionsToDb(): { synced: number } {
  const hermesSessions = readHermesSessionsFromStateDb();
  const missionIdByJobId = buildMissionIdByJobId();
  const database = db();

  // Upsert: insert new or update existing (including ended_at / status for completed sessions)
  const upsert = database.prepare(/* sql */ `
    INSERT INTO sessions (
      id, agent_type, source, mission_id,
      model_id, provider, title, size, started_at, ended_at,
      status, exit_code
    ) VALUES (
      ?, 'hermes', ?, ?,
      ?, NULL, ?, ?, ?, ?,
      ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      title      = excluded.title,
      model_id   = COALESCE(excluded.model_id, model_id),
      size       = excluded.size,
      started_at = excluded.started_at,
      ended_at   = COALESCE(excluded.ended_at, ended_at),
      status     = excluded.status,
      exit_code  = COALESCE(excluded.exit_code, exit_code)
  `);

  const tx = database.transaction(() => {
    let count = 0;
    for (const row of hermesSessions) {
      const startedAt = new Date(row.started_at * 1000).toISOString();
      const endedAt = row.ended_at
        ? new Date(row.ended_at * 1000).toISOString()
        : null;
      const { status, exitCode } = hermesStatusFromEndReason(row.end_reason);
      const size = Math.max(
        (row.message_count ?? 0) * 200 + (row.api_call_count ?? 0) * 50,
        0,
      );

      // Derive title and mission_id from session id format:
      // cron sessions: cron_<jobid>_<date>_<time>
      let title = row.title ?? row.id;
      let missionId: string | null = null;

      if (row.source === "cron") {
        const parts = row.id.replace(/^cron_/, "").split("_");
        if (parts.length >= 3) {
          const jobId = parts[0];
          title = `Cron: ${jobId} — ${parts.slice(1).join(" ")}`;
          missionId = missionIdByJobId.get(jobId) ?? null;
        }
      } else if (row.source === "api_server") {
        // api_server sessions treated as cli
      }

      upsert.run(
        row.id,
        row.source === "api_server" ? "cli" : row.source,
        missionId,
        row.model ?? null,
        title,
        size,
        startedAt,
        endedAt,
        status,
        exitCode,
      );
      count++;
    }
    return count;
  });

  return { synced: tx() };
}
