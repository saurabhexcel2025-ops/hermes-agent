// ═══════════════════════════════════════════════════════════════
// goal-session-repository.ts — Goal session CRUD via SQLite
// ═══════════════════════════════════════════════════════════════

import { db, inTransaction, uuid, now } from "./db";
import type { GoalSession, GoalStep, GoalLoopMode, GoalSessionStatus } from "@/types/hermes";

// ── Row types ─────────────────────────────────────────────────

interface SessionRow {
  id: string; card_id: string; board_id: string; mode: string;
  goals: string; current_goal_index: number; status: string;
  coordinator_mission_id: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
}
interface StepRow {
  id: string; session_id: string; step_index: number; goal: string;
  status: string; mission_id: string | null; assigned_profile_id: string | null;
  completed_at: string | null; error: string | null;
  created_at: string; updated_at: string;
}

// ── Mappers ──────────────────────────────────────────────────

function rowToStep(row: StepRow): GoalStep {
  return {
    index: row.step_index,
    goal: row.goal,
    status: row.status as GoalStep["status"],
    missionId: row.mission_id ?? null,
    assignedProfileId: row.assigned_profile_id ?? null,
    completedAt: row.completed_at ?? null,
    error: row.error ?? null,
  };
}

function rowToSession(row: SessionRow, stepRows: StepRow[]): GoalSession {
  return {
    id: row.id,
    cardId: row.card_id,
    boardId: row.board_id,
    goalLoopMode: row.mode as GoalLoopMode,
    goals: JSON.parse(row.goals || "[]"),
    currentGoalIndex: row.current_goal_index,
    steps: stepRows.map(rowToStep),
    status: row.status as GoalSessionStatus,
    coordinatorMissionId: row.coordinator_mission_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── CRUD ─────────────────────────────────────────────────────

export function listGoalSessions(boardId?: string): GoalSession[] {
  let rows: SessionRow[];
  if (boardId) {
    rows = db()
      .prepare(
        "SELECT * FROM goal_sessions WHERE board_id = ? AND deleted_at IS NULL ORDER BY created_at DESC"
      )
      .all(boardId) as SessionRow[];
  } else {
    rows = db()
      .prepare(
        "SELECT * FROM goal_sessions WHERE deleted_at IS NULL ORDER BY created_at DESC"
      )
      .all() as SessionRow[];
  }

  return rows.map((row) => {
    const stepRows = db()
      .prepare(
        "SELECT * FROM goal_steps WHERE session_id = ? ORDER BY step_index"
      )
      .all(row.id) as StepRow[];
    return rowToSession(row, stepRows);
  });
}

export function listGoalSessionsByCard(cardId: string): GoalSession[] {
  const rows = db()
    .prepare(
      "SELECT * FROM goal_sessions WHERE card_id = ? AND deleted_at IS NULL ORDER BY created_at DESC"
    )
    .all(cardId) as SessionRow[];

  return rows.map((row) => {
    const stepRows = db()
      .prepare(
        "SELECT * FROM goal_steps WHERE session_id = ? ORDER BY step_index"
      )
      .all(row.id) as StepRow[];
    return rowToSession(row, stepRows);
  });
}

export function getGoalSession(id: string): GoalSession | null {
  const row = db()
    .prepare("SELECT * FROM goal_sessions WHERE id = ?")
    .get(id) as SessionRow | undefined;
  if (!row || row.deleted_at) return null;
  const stepRows = db()
    .prepare(
      "SELECT * FROM goal_steps WHERE session_id = ? ORDER BY step_index"
    )
    .all(id) as StepRow[];
  return rowToSession(row, stepRows);
}

export function createGoalSession(data: {
  cardId: string;
  boardId: string;
  mode: GoalLoopMode;
  goals: string[];
  assignedProfileId?: string;
}): GoalSession {
  const id = uuid();
  const ts = now();

  inTransaction(() => {
    db()
      .prepare(
        `INSERT INTO goal_sessions
           (id, card_id, board_id, mode, goals, current_goal_index, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 'active', ?, ?)`
      )
      .run(id, data.cardId, data.boardId, data.mode, JSON.stringify(data.goals), ts, ts);

    // Insert all goal steps
    for (let i = 0; i < data.goals.length; i++) {
      db()
        .prepare(
          `INSERT INTO goal_steps
             (id, session_id, step_index, goal, status, assigned_profile_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`
        )
        .run(uuid(), id, i, data.goals[i], data.assignedProfileId ?? null, ts, ts);
    }
  });

  return getGoalSession(id)!;
}

export function updateGoalSession(
  id: string,
  updates: {
    currentGoalIndex?: number;
    status?: GoalSessionStatus;
    coordinatorMissionId?: string;
  }
): GoalSession | null {
  const existing = getGoalSession(id);
  if (!existing) return null;
  const ts = now();

  inTransaction(() => {
    const sets: string[] = ["updated_at = ?"];
    const vals: unknown[] = [ts];
    if (updates.currentGoalIndex !== undefined) {
      sets.push("current_goal_index = ?");
      vals.push(updates.currentGoalIndex);
    }
    if (updates.status !== undefined) {
      sets.push("status = ?");
      vals.push(updates.status);
    }
    if (updates.coordinatorMissionId !== undefined) {
      sets.push("coordinator_mission_id = ?");
      vals.push(updates.coordinatorMissionId);
    }
    vals.push(id);
    db()
      .prepare(`UPDATE goal_sessions SET ${sets.join(", ")} WHERE id = ?`)
      .run(...vals);
  });

  return getGoalSession(id);
}

export function updateGoalStep(
  stepIndex: number,
  sessionId: string,
  updates: {
    status?: GoalStep["status"];
    missionId?: string;
    error?: string;
    completedAt?: string;
  }
): GoalStep | null {
  const existing = db()
    .prepare("SELECT * FROM goal_steps WHERE session_id = ? AND step_index = ?")
    .get(sessionId, stepIndex) as StepRow | undefined;
  if (!existing) return null;
  const ts = now();

  const sets: string[] = ["updated_at = ?"];
  const vals: unknown[] = [ts];
  if (updates.status !== undefined) { sets.push("status = ?"); vals.push(updates.status); }
  if (updates.missionId !== undefined) { sets.push("mission_id = ?"); vals.push(updates.missionId); }
  if (updates.error !== undefined) { sets.push("error = ?"); vals.push(updates.error); }
  if (updates.completedAt !== undefined) { sets.push("completed_at = ?"); vals.push(updates.completedAt); }
  vals.push(sessionId, stepIndex);

  db()
    .prepare(`UPDATE goal_steps SET ${sets.join(", ")} WHERE session_id = ? AND step_index = ?`)
    .run(...vals);

  const updated = db()
    .prepare("SELECT * FROM goal_steps WHERE session_id = ? AND step_index = ?")
    .get(sessionId, stepIndex) as StepRow;
  return rowToStep(updated);
}

export function deleteGoalSession(id: string): boolean {
  const existing = getGoalSession(id);
  if (!existing) return false;
  const ts = now();
  db()
    .prepare("UPDATE goal_sessions SET deleted_at = ? WHERE id = ?")
    .run(ts, id);
  return true;
}

export function getActiveGoalSessionForCard(cardId: string): GoalSession | null {
  const row = db()
    .prepare(
      "SELECT * FROM goal_sessions WHERE card_id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1"
    )
    .get(cardId) as SessionRow | undefined;
  if (!row) return null;
  const stepRows = db()
    .prepare(
      "SELECT * FROM goal_steps WHERE session_id = ? ORDER BY step_index"
    )
    .all(row.id) as StepRow[];
  return rowToSession(row, stepRows);
}
