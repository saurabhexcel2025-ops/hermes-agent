// ═══════════════════════════════════════════════════════════════
// Goals Bridge — Control Hub ↔ Persistent Goals DB interface
// ═══════════════════════════════════════════════════════════════
// CRUD for goals with checkpoints and kanban task linking.
// Stored in control-hub.db (CH SQLite), not Hermes kanban.db.
// ═══════════════════════════════════════════════════════════════

import { getDb, uuid } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "in_progress" | "completed" | "archived";
  priority: number;
  category: string | null;
  mission_id: string | null;
  parent_goal_id: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  /** Computed progress percentage 0-100, always present in list results. */
  progress_pct: number;
}

export interface GoalCheckpoint {
  id: number;
  goal_id: string;
  title: string;
  completed: number;
  completed_at: number | null;
  order_index: number;
}

export interface GoalDetail extends Goal {
  checkpoints: GoalCheckpoint[];
  linked_tasks: Array<{ task_id: string }>;
  /** Computed: number of completed checkpoints / total * 100 */
  progress_pct: number;
}

export interface GoalStats {
  active: number;
  in_progress: number;
  completed: number;
  archived: number;
  by_category: Record<string, number>;
  total: number;
}

// ── Create ─────────────────────────────────────────────────────────

export function createGoal(params: {
  title: string;
  description?: string;
  priority?: number;
  category?: string;
  mission_id?: string;
  parent_goal_id?: string;
}): Goal {
  const db = getDb();
  const id = `goal_${uuid().slice(0, 12)}`;
  const nowUnix = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO goals (id, title, description, priority, category, mission_id, parent_goal_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, params.title, params.description || null, params.priority ?? 3, params.category || null, params.mission_id || null, params.parent_goal_id || null, nowUnix, nowUnix);

  return getGoal(id)!;
}

// ── Read ───────────────────────────────────────────────────────────

export function listGoals(filters?: {
  status?: string;
  category?: string;
  priority?: number;
  limit?: number;
}): GoalDetail[] {
  const db = getDb();
  let sql = `SELECT g.*, 
    COALESCE(cp_stats.total, 0) AS checkpoints_total,
    COALESCE(cp_stats.done, 0) AS checkpoints_done
    FROM goals g
    LEFT JOIN (
      SELECT goal_id, COUNT(*) AS total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS done
      FROM goal_checkpoints GROUP BY goal_id
    ) cp_stats ON cp_stats.goal_id = g.id
    WHERE 1=1`;
  const params: unknown[] = [];

  if (filters?.status) {
    sql += " AND g.status = ?";
    params.push(filters.status);
  }
  if (filters?.category) {
    sql += " AND g.category = ?";
    params.push(filters.category);
  }
  if (filters?.priority) {
    sql += " AND g.priority = ?";
    params.push(filters.priority);
  }

  sql += " ORDER BY g.priority DESC, g.created_at DESC";
  if (filters?.limit) {
    sql += " LIMIT ?";
    params.push(filters.limit);
  }

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const total = (row.checkpoints_total as number) || 0;
    const done = (row.checkpoints_done as number) || 0;
    const progress_pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const { checkpoints_total, checkpoints_done, ...goal } = row;
    return { ...goal, progress_pct } as unknown as GoalDetail;
  });
}

export function getGoal(id: string): GoalDetail | null {
  const db = getDb();
  const goal = db.prepare("SELECT * FROM goals WHERE id = ?").get(id) as Goal | undefined;
  if (!goal) return null;

  const checkpoints = db
    .prepare("SELECT * FROM goal_checkpoints WHERE goal_id = ? ORDER BY order_index ASC")
    .all(id) as GoalCheckpoint[];

  const linkedTasks = db
    .prepare("SELECT task_id FROM goal_kanban_tasks WHERE goal_id = ?")
    .all(id) as Array<{ task_id: string }>;

  const totalCp = checkpoints.length;
  const doneCp = checkpoints.filter((c) => c.completed === 1).length;
  const progressPct = totalCp > 0 ? Math.round((doneCp / totalCp) * 100) : 0;

  return { ...goal, checkpoints, linked_tasks: linkedTasks, progress_pct: progressPct };
}

export function getGoalStats(): GoalStats {
  const db = getDb();
  const rows = db
    .prepare("SELECT status, COUNT(*) as count FROM goals GROUP BY status")
    .all() as Array<{ status: string; count: number }>;

  const catRows = db
    .prepare("SELECT category, COUNT(*) as count FROM goals WHERE category IS NOT NULL GROUP BY category")
    .all() as Array<{ category: string; count: number }>;

  const byStatus: Record<string, number> = { active: 0, in_progress: 0, completed: 0, archived: 0 };
  for (const r of rows) byStatus[r.status] = r.count;

  return {
    active: byStatus.active || 0,
    in_progress: byStatus.in_progress || 0,
    completed: byStatus.completed || 0,
    archived: byStatus.archived || 0,
    by_category: Object.fromEntries(catRows.map((r) => [r.category, r.count])),
    total: rows.reduce((sum, r) => sum + r.count, 0),
  };
}

// ── Update ─────────────────────────────────────────────────────────

export function updateGoal(id: string, updates: {
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  category?: string;
  mission_id?: string | null;
  parent_goal_id?: string | null;
}): Goal | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM goals WHERE id = ?").get(id) as Goal | undefined;
  if (!existing) return null;

  const nowUnix = Math.floor(Date.now() / 1000);
  const completedAt = updates.status === "completed" ? nowUnix : existing.completed_at;

  db.prepare(`
    UPDATE goals SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      category = COALESCE(?, category),
      mission_id = ?,
      parent_goal_id = ?,
      completed_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    updates.title ?? null,
    updates.description ?? null,
    updates.status ?? null,
    updates.priority ?? null,
    updates.category ?? null,
    updates.mission_id !== undefined ? updates.mission_id : existing.mission_id,
    updates.parent_goal_id !== undefined ? updates.parent_goal_id : existing.parent_goal_id,
    completedAt,
    nowUnix,
    id,
  );

  return getGoal(id);
}

// ── Delete ─────────────────────────────────────────────────────────

export function deleteGoal(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM goals WHERE id = ?").run(id);
  return result.changes > 0;
}

// ── Checkpoints ────────────────────────────────────────────────────

export function addCheckpoint(goalId: string, title: string): GoalCheckpoint | null {
  const db = getDb();
  const goal = db.prepare("SELECT id FROM goals WHERE id = ?").get(goalId);
  if (!goal) return null;

  // Get next order_index
  const last = db
    .prepare("SELECT MAX(order_index) as max_idx FROM goal_checkpoints WHERE goal_id = ?")
    .get(goalId) as { max_idx: number | null };
  const nextIdx = (last?.max_idx ?? -1) + 1;

  const result = db
    .prepare("INSERT INTO goal_checkpoints (goal_id, title, order_index) VALUES (?, ?, ?)")
    .run(goalId, title, nextIdx);

  return db
    .prepare("SELECT * FROM goal_checkpoints WHERE id = ?")
    .get(result.lastInsertRowid) as GoalCheckpoint;
}

export function toggleCheckpoint(checkpointId: number): GoalCheckpoint | null {
  const db = getDb();
  const cp = db
    .prepare("SELECT * FROM goal_checkpoints WHERE id = ?")
    .get(checkpointId) as GoalCheckpoint | undefined;
  if (!cp) return null;

  const nowUnix = Math.floor(Date.now() / 1000);
  const newCompleted = cp.completed === 1 ? 0 : 1;
  const completedAt = newCompleted === 1 ? nowUnix : null;

  db.prepare("UPDATE goal_checkpoints SET completed = ?, completed_at = ? WHERE id = ?")
    .run(newCompleted, completedAt, checkpointId);

  return db
    .prepare("SELECT * FROM goal_checkpoints WHERE id = ?")
    .get(checkpointId) as GoalCheckpoint;
}

export function removeCheckpoint(checkpointId: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM goal_checkpoints WHERE id = ?").run(checkpointId);
  return result.changes > 0;
}

// ── Kanban Task Linking ────────────────────────────────────────────

export function linkKanbanTask(goalId: string, taskId: string): boolean {
  const db = getDb();
  try {
    db.prepare("INSERT OR IGNORE INTO goal_kanban_tasks (goal_id, task_id) VALUES (?, ?)")
      .run(goalId, taskId);
    return true;
  } catch {
    return false;
  }
}

export function unlinkKanbanTask(goalId: string, taskId: string): boolean {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM goal_kanban_tasks WHERE goal_id = ? AND task_id = ?")
    .run(goalId, taskId);
  return result.changes > 0;
}
