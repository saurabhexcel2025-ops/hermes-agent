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
import { existsSync, readdirSync, statSync } from "fs";
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

// ── Hermes file sync ─────────────────────────────────────────

interface HermesSessionFile {
  filename: string;
  id: string;
  title: string;
  source: SessionSource;
  size: number;
  created: string;
  modified: string;
}

/**
 * Read session metadata directly from Hermes's state.db SQLite database.
 * Hermes (v0.14+) stores all sessions here instead of flat JSON files.
 * Returns lightweight session metadata suitable for the sessions table.
 */
function readHermesSessionsFromStateDb(): HermesSessionFile[] {
  const root = getActiveHermesPaths().root;
  const stateDbPath = join(root, "state.db");
  if (!existsSync(stateDbPath)) return [];

  try {
    const hermesDb = new Database(stateDbPath, { readonly: true });
    // Ensure sessions table exists
    const tables = hermesDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
      .all();
    if (tables.length === 0) {
      hermesDb.close();
      return [];
    }

    const rows = hermesDb
      .prepare(
        `SELECT id, source, model, title, started_at, ended_at, message_count, api_call_count
         FROM sessions ORDER BY started_at DESC LIMIT 5000`,
      )
      .all() as Array<{
      id: string;
      source: string;
      model: string;
      title: string | null;
      started_at: number;
      ended_at: number | null;
      message_count: number | null;
      api_call_count: number | null;
    }>;
    hermesDb.close();

    return rows.map((row) => {
      const startedAt = row.started_at
        ? new Date(row.started_at * 1000).toISOString()
        : new Date().toISOString();
      const endedAt = row.ended_at
        ? new Date(row.ended_at * 1000).toISOString()
        : null;
      const size = Math.max(
        (row.message_count ?? 0) * 200 + (row.api_call_count ?? 0) * 50,
        0,
      );

      // Derive title from session id or stored title
      let title = row.title ?? row.id;
      let source: SessionSource = "cli";
      if (row.source === "cron") {
        source = "cron";
        // Format: cron_<jobid>_<date>_<time>
        const parts = row.id.replace(/^cron_/, "").split("_");
        if (parts.length >= 3) {
          title = `Cron: ${parts[0]} — ${parts.slice(1).join(" ")}`;
        }
      } else if (row.source === "api_server") {
        source = "cli";
      }

      return {
        filename: row.id,
        id: row.id,
        title,
        source,
        size,
        created: startedAt,
        modified: endedAt ?? startedAt,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Sync Hermes sessions into the sessions table.
 *
 * Reads session metadata directly from Hermes's state.db (v0.14+),
 * which is the canonical source for all Hermes-born sessions
 * (CLI, cron, API). Upserts into the sessions table so Control Hub
 * has a unified view of all agent activity.
 *
 * Sessions that no longer exist in Hermes are NOT deleted from the DB —
 * completed sessions remain in the record.
 */
export function syncHermesSessionsToDb(): { synced: number } {
  const files = readHermesSessionsFromStateDb();
  const database = db();
  const upsert = database.prepare(/* sql */ `
    INSERT INTO sessions (
      id, agent_type, source, title, size, started_at, status
    ) VALUES (
      ?, 'hermes', ?, ?, ?, ?, 'active'
    )
    ON CONFLICT(id) DO UPDATE SET
      title   = excluded.title,
      size    = excluded.size,
      started_at = excluded.started_at
  `);

  const tx = database.transaction(() => {
    let count = 0;
    for (const f of files) {
      upsert.run(f.id, f.source, f.title, f.size, f.modified);
      count++;
    }
    return count;
  });

  return { synced: tx() };
}
