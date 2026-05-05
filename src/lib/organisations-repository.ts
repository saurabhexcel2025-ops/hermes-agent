/**
 * organisations-repository.ts
 *
 * CRUD operations for the `organisations` table and the many-to-many
 * `organisation_teams` join table.
 *
 * An organisation is a grouping of teams, led by a person (the leader).
 * A team can belong to multiple organisations (many-to-many).
 */

import { getDb } from "@/lib/db";

export interface Organisation {
  id: string;
  name: string;
  description: string;
  leaderId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface OrganisationTeam {
  id: string;
  orgId: string;
  teamId: string;
  position: number;
  joinedAt: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  description: string;
  leaderId: string;
  memberCount: number;
  boardCount: number;
}

// ── Helpers ───────────────────────────────────────────────────

function rowToOrg(row: Record<string, unknown>): Organisation {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) || "",
    leaderId: row.leader_id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string) || null,
  };
}

// ── CRUD ──────────────────────────────────────────────────────

/**
 * Create a new organisation.
 * @param org - organisation fields (id must be provided by caller)
 */
export function createOrganisation(org: {
  id: string;
  name: string;
  description?: string;
  leaderId: string;
}): Organisation {
  const db = getDb();
  db.prepare(`
    INSERT INTO organisations (id, name, description, leader_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(org.id, org.name, org.description ?? "", org.leaderId);
  return getOrganisation(org.id)!;
}

/**
 * Fetch a single organisation by ID. Returns null if not found or soft-deleted.
 */
export function getOrganisation(id: string): Organisation | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM organisations WHERE id = ? AND deleted_at IS NULL")
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToOrg(row) : null;
}

/**
 * List all active organisations.
 */
export function listOrganisations(): Organisation[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM organisations WHERE deleted_at IS NULL ORDER BY created_at DESC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToOrg);
}

/**
 * Update an organisation's fields. Omit fields to leave unchanged.
 */
export function updateOrganisation(
  id: string,
  patch: Partial<Pick<Organisation, "name" | "description" | "leaderId">>
): Organisation | null {
  const existing = getOrganisation(id);
  if (!existing) return null;
  const db = getDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const args: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    args.push(patch.name);
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    args.push(patch.description);
  }
  if (patch.leaderId !== undefined) {
    sets.push("leader_id = ?");
    args.push(patch.leaderId);
  }
  args.push(id);
  db.prepare(`UPDATE organisations SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  return getOrganisation(id);
}

/**
 * Soft-delete an organisation.
 */
export function deleteOrganisation(id: string): boolean {
  const db = getDb();
  const info = db
    .prepare("UPDATE organisations SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
    .run(id);
  return info.changes > 0;
}

// ── Team association ──────────────────────────────────────────

/**
 * Add a team to an organisation.
 * Idempotent: uses INSERT OR IGNORE so re-adding a removed team is a no-op.
 */
export function addTeamToOrganisation(
  id: string,
  teamId: string,
  position?: number
): boolean {
  const db = getDb();
  const org = getOrganisation(id);
  if (!org) return false;
  const info = db
    .prepare(
      "INSERT OR IGNORE INTO organisation_teams (id, org_id, team_id, position, joined_at) VALUES (?, ?, ?, ?, datetime('now'))"
    )
    .run(
      `ot-${id}-${teamId}-${Date.now()}`,
      id,
      teamId,
      position ?? 0
    );
  return info.changes > 0;
}

/**
 * Remove a team from an organisation.
 */
export function removeTeamFromOrganisation(orgId: string, teamId: string): boolean {
  const db = getDb();
  const info = db
    .prepare("DELETE FROM organisation_teams WHERE org_id = ? AND team_id = ?")
    .run(orgId, teamId);
  return info.changes > 0;
}

/**
 * List all teams belonging to an organisation, with member and board counts.
 */
export function listOrganisationTeams(orgId: string): TeamSummary[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT
        t.id,
        t.name,
        t.description,
        t.leader_id,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id)   AS member_count,
        (SELECT COUNT(*) FROM kanban_boards WHERE team_id = t.id) AS board_count
      FROM organisation_teams ot
      JOIN teams t ON t.id = ot.team_id
      WHERE ot.org_id = ?
        AND t.deleted_at IS NULL
      ORDER BY ot.position ASC, ot.joined_at ASC
    `)
    .all(orgId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) || "",
    leaderId: r.leader_id as string,
    memberCount: r.member_count as number,
    boardCount: r.board_count as number,
  }));
}

/**
 * List all teams NOT yet in a given organisation (for the "add team" picker).
 */
export function listUnassignedTeams(orgId: string): TeamSummary[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT
        t.id,
        t.name,
        t.description,
        t.leader_id,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id)   AS member_count,
        (SELECT COUNT(*) FROM kanban_boards WHERE team_id = t.id) AS board_count
      FROM teams t
      WHERE t.deleted_at IS NULL
        AND t.id NOT IN (
          SELECT team_id FROM organisation_teams WHERE org_id = ?
        )
      ORDER BY t.name ASC
    `)
    .all(orgId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) || "",
    leaderId: r.leader_id as string,
    memberCount: r.member_count as number,
    boardCount: r.board_count as number,
  }));
}
