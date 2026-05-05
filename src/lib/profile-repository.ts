// ═══════════════════════════════════════════════════════════════
// profile-repository.ts — AgentProfile CRUD via SQLite
// ═══════════════════════════════════════════════════════════════

import { db, inTransaction, uuid, now } from "./db";
import type { AgentProfile } from "@/lib/agent-backend/types";
import type { CreateProfileInput } from "@/lib/agent-backend/types";

// ── Row shape ─────────────────────────────────────────────────

interface ProfileRow {
  id: string;
  name: string;
  description: string;
  role: string;
  status: "active" | "inactive";
  config: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToProfile(row: ProfileRow | undefined): AgentProfile | null {
  if (!row || row.deleted_at) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    role: row.role,
    status: row.status,
    config: JSON.parse(row.config || "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── CRUD ─────────────────────────────────────────────────────

export function listProfiles(): AgentProfile[] {
  const rows = db()
    .prepare(
      "SELECT * FROM agent_profiles WHERE deleted_at IS NULL ORDER BY name"
    )
    .all() as ProfileRow[];
  return rows.map(rowToProfile).filter(Boolean) as AgentProfile[];
}

export function getProfile(id: string): AgentProfile | null {
  const row = db()
    .prepare("SELECT * FROM agent_profiles WHERE id = ?")
    .get(id) as ProfileRow | undefined;
  return rowToProfile(row);
}

export function createProfile(input: CreateProfileInput): AgentProfile {
  const id = uuid();
  const ts = now();
  const config = JSON.stringify(input.config ?? {});

  inTransaction(() => {
    db()
      .prepare(
        `INSERT INTO agent_profiles (id, name, description, role, status, config, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`
      )
      .run(
        id,
        input.name,
        input.description ?? "",
        input.role ?? "agent",
        config,
        ts,
        ts
      );
  });

  return getProfile(id)!;
}

export function updateProfile(
  id: string,
  input: Partial<CreateProfileInput>
): AgentProfile | null {
  const existing = getProfile(id);
  if (!existing) return null;

  const updated: AgentProfile = {
    ...existing,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    role: input.role ?? existing.role,
    config: input.config ?? existing.config,
    updatedAt: now(),
  };

  inTransaction(() => {
    db()
      .prepare(
        `UPDATE agent_profiles
           SET name = ?, description = ?, role = ?, config = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        updated.name,
        updated.description,
        updated.role,
        JSON.stringify(updated.config),
        updated.updatedAt,
        id
      );
  });

  return getProfile(id);
}

export function deleteProfile(id: string): boolean {
  const existing = getProfile(id);
  if (!existing) return false;
  const ts = now();
  db()
    .prepare("UPDATE agent_profiles SET deleted_at = ? WHERE id = ?")
    .run(ts, id);
  return true;
}
