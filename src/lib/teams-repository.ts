// ═══════════════════════════════════════════════════════════════
// teams-repository.ts — Teams CRUD via SQLite
// ═══════════════════════════════════════════════════════════════

import { db, inTransaction, uuid, now } from "./db";
import type { Team, TeamMember } from "@/types/hermes";

// ── Row types ─────────────────────────────────────────────────

interface TeamRow {
  id: string; name: string; description: string;
  leader_id: string; created_at: string; updated_at: string; deleted_at: string | null;
}
interface MemberRow {
  id: string; team_id: string; profile_id: string;
  role: string; joined_at: string;
}

// ── Mappers ────────────────────────────────────────────────

function rowToMember(row: MemberRow): TeamMember {
  return {
    profileId: row.profile_id,
    role: row.role as TeamMember["role"],
    joinedAt: row.joined_at,
  };
}

function rowToTeam(row: TeamRow, memberRows: MemberRow[]): Team {
  return {
    id: row.id, name: row.name, description: row.description,
    leaderProfileId: row.leader_id,
    members: memberRows.map(rowToMember),
    boardIds: [],
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// ── CRUD ─────────────────────────────────────────────────────

export function listTeams(): Team[] {
  const rows = db()
    .prepare(
      "SELECT * FROM teams WHERE deleted_at IS NULL ORDER BY name"
    )
    .all() as TeamRow[];
  return rows.map((row) => {
    const members = db()
      .prepare(
        "SELECT * FROM team_members WHERE team_id = ?"
      )
      .all(row.id) as MemberRow[];
    return rowToTeam(row, members);
  });
}

export function getTeam(id: string): Team | null {
  const row = db()
    .prepare("SELECT * FROM teams WHERE id = ?")
    .get(id) as TeamRow | undefined;
  if (!row || row.deleted_at) return null;
  const members = db()
    .prepare("SELECT * FROM team_members WHERE team_id = ?")
    .all(id) as MemberRow[];
  return rowToTeam(row, members);
}

export function createTeam(data: {
  name: string;
  description?: string;
  leaderProfileId: string;
  memberIds?: string[];
}): Team {
  const id = uuid();
  const ts = now();

  inTransaction(() => {
    db()
      .prepare(
        `INSERT INTO teams (id, name, description, leader_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.name, data.description ?? "", data.leaderProfileId, ts, ts);

    // Add leader as member
    db()
      .prepare(
        `INSERT INTO team_members (id, team_id, profile_id, role, joined_at)
         VALUES (?, ?, ?, 'leader', ?)`
      )
      .run(uuid(), id, data.leaderProfileId, ts);

    // Add other members
    for (const profileId of data.memberIds ?? []) {
      if (profileId === data.leaderProfileId) continue;
      db()
        .prepare(
          `INSERT INTO team_members (id, team_id, profile_id, role, joined_at)
           VALUES (?, ?, ?, 'specialist', ?)`
        )
        .run(uuid(), id, profileId, ts);
    }
  });

  return getTeam(id)!;
}

export function updateTeam(
  id: string,
  updates: {
    name?: string;
    description?: string;
    leaderProfileId?: string;
  }
): Team | null {
  const existing = getTeam(id);
  if (!existing) return null;
  const ts = now();

  inTransaction(() => {
    const sets: string[] = ["updated_at = ?"];
    const vals: unknown[] = [ts];
    if (updates.name !== undefined) { sets.push("name = ?"); vals.push(updates.name); }
    if (updates.description !== undefined) { sets.push("description = ?"); vals.push(updates.description); }
    if (updates.leaderProfileId !== undefined) {
      sets.push("leader_id = ?"); vals.push(updates.leaderProfileId);
      // Update leader role
      db()
        .prepare(
          "UPDATE team_members SET role = 'specialist' WHERE team_id = ? AND role = 'leader'"
        )
        .run(id);
    }
    vals.push(id);
    db()
      .prepare(`UPDATE teams SET ${sets.join(", ")} WHERE id = ?`)
      .run(...vals);
  });

  return getTeam(id);
}

export function deleteTeam(id: string): boolean {
  const existing = getTeam(id);
  if (!existing) return false;
  const ts = now();
  db()
    .prepare("UPDATE teams SET deleted_at = ? WHERE id = ?")
    .run(ts, id);
  return true;
}

export function addTeamMember(
  teamId: string,
  profileId: string,
  role: TeamMember["role"]
): Team | null {
  const team = getTeam(teamId);
  if (!team) return null;
  const ts = now();

  inTransaction(() => {
    db()
      .prepare(
        `INSERT OR IGNORE INTO team_members (id, team_id, profile_id, role, joined_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(uuid(), teamId, profileId, role, ts);
  });

  return getTeam(teamId);
}

export function removeTeamMember(teamId: string, profileId: string): boolean {
  const existing = getTeam(teamId);
  if (!existing) return false;
  // Cannot remove the leader
  if (existing.leaderProfileId === profileId) return false;
  db()
    .prepare("DELETE FROM team_members WHERE team_id = ? AND profile_id = ?")
    .run(teamId, profileId);
  return true;
}

export function updateTeamMemberRole(
  teamId: string,
  profileId: string,
  role: TeamMember["role"]
): Team | null {
  const existing = getTeam(teamId);
  if (!existing) return null;
  db()
    .prepare(
      "UPDATE team_members SET role = ? WHERE team_id = ? AND profile_id = ?"
    )
    .run(role, teamId, profileId);
  return getTeam(teamId);
}
