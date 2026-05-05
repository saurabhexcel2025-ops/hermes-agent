// ═══════════════════════════════════════════════════════════════
// /api/goals — Goal Session CRUD (SQLite)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { requireMcApiKey, requireNotReadOnly } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { appendAuditLine } from "@/lib/audit-log";
import {
  listGoalSessions,
  getGoalSession,
  createGoalSession,
  updateGoalSession,
  updateGoalStep,
  deleteGoalSession,
  listGoalSessionsByCard,
} from "@/lib/goal-session-repository";
import { getMission } from "@/lib/mission-repository";
import type { GoalSession, GoalStep } from "@/types/hermes";

// ── GET ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("id");
  const boardId = url.searchParams.get("boardId");
  const cardId = url.searchParams.get("cardId");

  try {
    if (sessionId) {
      const session = getGoalSession(sessionId);
      if (!session) {
        return NextResponse.json({ error: "Goal session not found" }, { status: 404 });
      }
      return NextResponse.json({ data: { session } });
    }

    if (boardId) {
      const sessions = listGoalSessions(boardId);
      return NextResponse.json({ data: { sessions } });
    }

    if (cardId) {
      const sessions = listGoalSessionsByCard(cardId);
      return NextResponse.json({ data: { sessions } });
    }

    const sessions = listGoalSessions();
    return NextResponse.json({ data: { sessions } });
  } catch (error) {
    logApiError("GET /api/goals", sessionId ?? "listing sessions", error);
    return NextResponse.json({ error: "Failed to load goal sessions" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ro = requireNotReadOnly();
  if (ro) return ro;
  const auth = requireMcApiKey(request);
  if (auth) return auth;

  try {
    const body = await request.json();
    const { action } = body as { action?: string };

    // ── Start Goal Loop ─────────────────────────────────────────
    if (action === "start") {
      const { boardId, cardId, goalLoopMode, goals, assignedProfileId } = body as {
        boardId?: string;
        cardId?: string;
        goalLoopMode?: "sequential" | "parallel";
        goals?: string[];
        assignedProfileId?: string;
      };

      if (!boardId || !cardId) {
        return NextResponse.json({ error: "boardId and cardId are required" }, { status: 400 });
      }
      if (!goals || !Array.isArray(goals) || goals.length === 0) {
        return NextResponse.json({ error: "At least one goal is required" }, { status: 400 });
      }
      if (!goalLoopMode) {
        return NextResponse.json({ error: "goalLoopMode is required" }, { status: 400 });
      }

      // Prevent duplicate active sessions
      const existing = listGoalSessionsByCard(cardId).filter(
        (s) => s.status === "active" || s.status === "paused"
      );
      if (existing.length > 0) {
        return NextResponse.json(
          { error: "An active goal loop already exists for this card", data: { session: existing[0] } },
          { status: 409 }
        );
      }

      const session = createGoalSession({
        boardId,
        cardId,
        mode: goalLoopMode,
        goals: goals.map((g: string) => g.trim()).filter(Boolean),
        assignedProfileId,
      });

      appendAuditLine({ action: "goals.start", resource: session.id, ok: true });
      return NextResponse.json({ data: { session } }, { status: 201 });
    }

    // ── Advance Goal ─────────────────────────────────────────────
    if (action === "advance") {
      const { sessionId, goalIndex, status, missionId, error } = body as {
        sessionId?: string;
        goalIndex?: number;
        status?: GoalStep["status"];
        missionId?: string | null;
        error?: string | null;
      };

      if (!sessionId || goalIndex === undefined) {
        return NextResponse.json({ error: "sessionId and goalIndex are required" }, { status: 400 });
      }

      // Update step status
      const step = updateGoalStep(goalIndex, sessionId, {
        status,
        missionId: missionId ?? undefined,
        error: error ?? undefined,
        completedAt: status === "done" || status === "failed" ? new Date().toISOString() : undefined,
      });

      if (!step) {
        return NextResponse.json({ error: "Step not found" }, { status: 404 });
      }

      // Advance session to next goal if sequential
      const session = getGoalSession(sessionId);
      if (session && (status === "done" || status === "failed") && session.goalLoopMode === "sequential") {
        const nextIndex = goalIndex + 1;
        if (nextIndex < session.goals.length) {
          updateGoalSession(sessionId, { currentGoalIndex: nextIndex });
        } else {
          updateGoalSession(sessionId, { status: status === "done" ? "completed" : "failed" });
        }
      } else if (session && (status === "done" || status === "failed")) {
        // Parallel: mark session complete when all steps done
        const allDone = session.steps.every((s: GoalStep) =>
          s.status === "done" || s.status === "failed"
        );
        if (allDone) {
          updateGoalSession(sessionId, { status: "completed" });
        }
      }

      const updated = getGoalSession(sessionId);
      appendAuditLine({ action: "goals.advance", resource: sessionId, ok: true });
      return NextResponse.json({ data: { session: updated } });
    }

    // ── Pause ──────────────────────────────────────────────────
    if (action === "pause") {
      const { sessionId } = body as { sessionId?: string };
      if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

      const session = updateGoalSession(sessionId, { status: "paused" });
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      appendAuditLine({ action: "goals.pause", resource: sessionId, ok: true });
      return NextResponse.json({ data: { session } });
    }

    // ── Resume ─────────────────────────────────────────────────
    if (action === "resume") {
      const { sessionId } = body as { sessionId?: string };
      if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

      const session = updateGoalSession(sessionId, { status: "active" });
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      appendAuditLine({ action: "goals.resume", resource: sessionId, ok: true });
      return NextResponse.json({ data: { session } });
    }

    // ── Cancel ─────────────────────────────────────────────────
    if (action === "cancel") {
      const { sessionId } = body as { sessionId?: string };
      if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

      const session = updateGoalSession(sessionId, { status: "cancelled" });
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      appendAuditLine({ action: "goals.cancel", resource: sessionId, ok: true });
      return NextResponse.json({ data: { session } });
    }

    // ── Check Mission Completion ────────────────────────────────
    if (action === "check-completion") {
      const { sessionId, goalIndex } = body as { sessionId?: string; goalIndex?: number };

      if (!sessionId || goalIndex === undefined) {
        return NextResponse.json({ error: "sessionId and goalIndex are required" }, { status: 400 });
      }

      const session = getGoalSession(sessionId);
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      const step = session.steps.find((s: GoalStep) => s.index === goalIndex);
      if (!step || !step.missionId) {
        return NextResponse.json({ error: "Step or linked mission not found" }, { status: 404 });
      }

      const mission = getMission(step.missionId);
      const done = mission?.result?.includes("GOAL_DONE") ?? false;
      const failed = mission?.status === "failed";

      if (done) {
        updateGoalStep(goalIndex, sessionId, {
          status: "done",
          completedAt: new Date().toISOString(),
        });
        const updatedSession = getGoalSession(sessionId);
        return NextResponse.json({ data: { session: updatedSession, goalDone: true } });
      }

      if (failed) {
        updateGoalStep(goalIndex, sessionId, {
          status: "failed",
          error: mission?.error ?? "Mission failed",
          completedAt: new Date().toISOString(),
        });
        const updatedSession = getGoalSession(sessionId);
        return NextResponse.json({ data: { session: updatedSession, goalDone: false, failed: true } });
      }

      return NextResponse.json({ data: { session, goalDone: false, inProgress: true } });
    }

    // ── Delete Session ──────────────────────────────────────────
    if (action === "delete") {
      const { sessionId } = body as { sessionId?: string };
      if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

      const ok = deleteGoalSession(sessionId);
      if (!ok) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      appendAuditLine({ action: "goals.delete", resource: sessionId, ok: true });
      return NextResponse.json({ data: { deleted: sessionId } });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    logApiError("POST /api/goals", "processing request", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
