// ═══════════════════════════════════════════════════════════════
// GoalSessionRepository — Goal session JSON under control-hub/data/goals
// ═══════════════════════════════════════════════════════════════

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";

import { PATHS } from "@/lib/hermes";
import { logApiError } from "@/lib/api-logger";
import type { GoalSession, GoalSessionStatus, GoalStep } from "@/types/hermes";

const DATA_DIR = PATHS.missions + "/../goals"; // ~/.control-hub/data/goals

// ── Internal JSON helpers ─────────────────────────────────────

function readJsonFile<T>(path: string, route: string, context: string): T | null {
  try {
    const text = readFileSync(path, "utf-8");
    return JSON.parse(text) as T;
  } catch (error) {
    logApiError(route, `parsing JSON ${context}`, error);
    return null;
  }
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

function ensureGoalsDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function sessionPath(id: string): string {
  return DATA_DIR + "/" + sanitizeId(id) + ".goal.json";
}

export function getGoalsDataDir(): string {
  return DATA_DIR;
}

export function loadGoalSession(id: string): GoalSession | null {
  const safe = sanitizeId(id);
  if (!safe) return null;
  return readJsonFile<GoalSession>(sessionPath(safe), "loadGoalSession", "session") ?? null;
}

export function saveGoalSession(session: GoalSession): void {
  ensureGoalsDir();
  const safe = sanitizeId(session.id);
  if (!safe) return;
  writeFileSync(sessionPath(safe), JSON.stringify(session, null, 2));
}

export function deleteGoalSession(id: string): boolean {
  const safe = sanitizeId(id);
  if (!safe) return false;
  const path = sessionPath(safe);
  if (!existsSync(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

export function listGoalSessions(): GoalSession[] {
  ensureGoalsDir();
  try {
    const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".goal.json"));
    const sessions: GoalSession[] = [];
    for (const file of files) {
      const session = readJsonFile<GoalSession>(
        DATA_DIR + "/" + file,
        "listGoalSessions",
        file
      );
      if (session) sessions.push(session);
    }
    return sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function listGoalSessionsByBoard(boardId: string): GoalSession[] {
  return listGoalSessions().filter((s) => s.boardId === boardId);
}

export function listGoalSessionsByCard(cardId: string): GoalSession[] {
  return listGoalSessions().filter((s) => s.cardId === cardId);
}

export function createGoalSession(params: {
  boardId: string;
  cardId: string;
  goalLoopMode: "sequential" | "parallel";
  goals: string[];
  assignedProfileId?: string;
}): GoalSession {
  const now = new Date().toISOString();
  const steps: GoalStep[] = params.goals.map((goal, index) => ({
    index,
    goal,
    status: "pending",
    missionId: null,
    assignedProfileId:
      params.assignedProfileId && params.goalLoopMode === "sequential"
        ? params.assignedProfileId
        : null,
    completedAt: null,
    error: null,
  }));

  const session: GoalSession = {
    id: newGoalId(),
    boardId: params.boardId,
    cardId: params.cardId,
    goalLoopMode: params.goalLoopMode,
    goals: params.goals,
    currentGoalIndex: 0,
    steps,
    status: "active",
    coordinatorMissionId: null,
    createdAt: now,
    updatedAt: now,
  };

  saveGoalSession(session);
  return session;
}

export function advanceGoalSession(
  sessionId: string,
  goalIndex: number,
  status: GoalSessionStatus,
  missionId?: string | null,
  error?: string | null
): GoalSession | null {
  const session = loadGoalSession(sessionId);
  if (!session) return null;

  const now = new Date().toISOString();
  const step = session.steps.find((s) => s.index === goalIndex);
  if (step) {
    step.status = status === "active" ? "active" : status === "completed" ? "done" : status === "failed" ? "failed" : "pending";
    if (missionId !== undefined) step.missionId = missionId;
    if (status === "completed") step.completedAt = now;
    if (error !== undefined) step.error = error;
  }

  // Advance currentGoalIndex to next pending goal
  const nextIndex = session.steps.findIndex(
    (s, i) => i > goalIndex && s.status === "pending"
  );
  session.currentGoalIndex = nextIndex >= 0 ? nextIndex : goalIndex;

  // Compute overall session status
  const allDone = session.steps.every((s) => s.status === "done" || s.status === "skipped");
  const anyFailed = session.steps.some((s) => s.status === "failed");
  if (allDone) session.status = "completed";
  else if (anyFailed) session.status = "failed";
  else if (status === "paused") session.status = "paused";
  else session.status = "active";

  session.updatedAt = now;
  saveGoalSession(session);
  return session;
}

function newGoalId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return "gs_" + timestamp + randomPart;
}
