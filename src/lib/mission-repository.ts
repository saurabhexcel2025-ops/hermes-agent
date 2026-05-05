// ═══════════════════════════════════════════════════════════════
// mission-repository.ts — Mission CRUD via SQLite
// ═══════════════════════════════════════════════════════════════

import { db, inTransaction, uuid, now } from "./db";
import type { Mission, MissionStatus } from "@/lib/agent-backend/types";

// ── Row shape ─────────────────────────────────────────────────

interface MissionRow {
  id: string;
  name: string;
  prompt: string;
  profile_id: string | null;
  status: string;
  result: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToMission(row: MissionRow | undefined): Mission | null {
  if (!row || row.deleted_at) return null;
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    profileId: row.profile_id ?? undefined,
    status: row.status as MissionStatus,
    result: row.result ?? undefined,
    sessionId: row.session_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── CRUD ─────────────────────────────────────────────────────

export function listMissions(): Mission[] {
  const rows = db()
    .prepare(
      "SELECT * FROM missions WHERE deleted_at IS NULL ORDER BY created_at DESC"
    )
    .all() as MissionRow[];
  return rows.map(rowToMission).filter(Boolean) as Mission[];
}

export function getMission(id: string): Mission | null {
  const row = db()
    .prepare("SELECT * FROM missions WHERE id = ?")
    .get(id) as MissionRow | undefined;
  return rowToMission(row);
}

export function createMission(data: {
  name: string;
  prompt: string;
  profileId?: string;
}): Mission {
  const id = uuid();
  const ts = now();

  inTransaction(() => {
    db()
      .prepare(
        `INSERT INTO missions (id, name, prompt, profile_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`
      )
      .run(id, data.name, data.prompt, data.profileId ?? null, ts, ts);
  });

  return getMission(id)!;
}

export function updateMission(
  id: string,
  updates: {
    status?: MissionStatus;
    result?: string;
    sessionId?: string;
  }
): Mission | null {
  const existing = getMission(id);
  if (!existing) return null;
  const ts = now();

  inTransaction(() => {
    const sets: string[] = ["updated_at = ?"];
    const vals: unknown[] = [ts];

    if (updates.status !== undefined) {
      sets.push("status = ?");
      vals.push(updates.status);
    }
    if (updates.result !== undefined) {
      sets.push("result = ?");
      vals.push(updates.result);
    }
    if (updates.sessionId !== undefined) {
      sets.push("session_id = ?");
      vals.push(updates.sessionId);
    }

    vals.push(id);
    db()
      .prepare(`UPDATE missions SET ${sets.join(", ")} WHERE id = ?`)
      .run(...vals);
  });

  return getMission(id);
}

export function deleteMission(id: string): boolean {
  const existing = getMission(id);
  if (!existing) return false;
  const ts = now();
  db()
    .prepare("UPDATE missions SET deleted_at = ? WHERE id = ?")
    .run(ts, id);
  return true;
}
