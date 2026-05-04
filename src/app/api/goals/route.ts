import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════
// /api/goals — Goal Session Orchestration
//
// Manages the goal-loop lifecycle for Kanban cards:
//   - Create sessions that track sequential or parallel goal execution
//   - Advance goals as sub-agent missions complete
//   - Poll for GOAL_DONE markers in mission sessions
// ═══════════════════════════════════════════════════════════════

import { requireMcApiKey, requireNotReadOnly } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { appendAuditLine } from "@/lib/audit-log";
import {
  loadGoalSession,
  saveGoalSession,
  deleteGoalSession,
  listGoalSessions,
  listGoalSessionsByBoard,
  listGoalSessionsByCard,
  createGoalSession,
  advanceGoalSession,
} from "@/lib/goal-session-repository";
import { loadMission } from "@/lib/missions-repository";
import type { GoalSession } from "@/types/hermes";

// ── GET ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("id");
  const boardId = url.searchParams.get("boardId");
  const cardId = url.searchParams.get("cardId");

  try {
    if (sessionId) {
      const session = loadGoalSession(sessionId);
      if (!session) {
        return NextResponse.json({ error: "Goal session not found" }, { status: 404 });
      }
      return NextResponse.json({ data: { session } });
    }

    if (boardId) {
      const sessions = listGoalSessionsByBoard(boardId);
      return NextResponse.json({ data: { sessions } });
    }

    if (cardId) {
      const sessions = listGoalSessionsByCard(cardId);
      return NextResponse.json({ data: { sessions } });
    }

    const sessions = listGoalSessions();
    return NextResponse.json({ data: { sessions } });
  } catch (error) {
    logApiError(
      "GET /api/goals",
      sessionId ? `session ${sessionId}` : "listing sessions",
      error
    );
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
        return NextResponse.json(
          { error: "boardId and cardId are required" },
          { status: 400 }
        );
      }

      if (!goals || !Array.isArray(goals) || goals.length === 0) {
        return NextResponse.json(
          { error: "At least one goal is required" },
          { status: 400 }
        );
      }

      if (!goalLoopMode) {
        return NextResponse.json(
          { error: "goalLoopMode is required (sequential or parallel)" },
          { status: 400 }
        );
      }

      // Prevent duplicate active sessions for same card
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
        goalLoopMode,
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
        status?: "completed" | "failed" | "paused" | "active";
        missionId?: string | null;
        error?: string | null;
      };

      if (!sessionId || goalIndex === undefined) {
        return NextResponse.json(
          { error: "sessionId and goalIndex are required" },
          { status: 400 }
        );
      }

      const session = advanceGoalSession(
        sessionId,
        goalIndex,
        (status as "completed" | "failed" | "paused") ?? "completed",
        missionId,
        error
      );

      if (!session) {
        return NextResponse.json({ error: "Goal session not found" }, { status: 404 });
      }

      appendAuditLine({ action: "goals.advance", resource: sessionId, ok: true });
      return NextResponse.json({ data: { session } });
    }

    // ── Pause / Resume ──────────────────────────────────────────
    if (action === "pause") {
      const { sessionId } = body as { sessionId?: string };
      if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

      const session = loadGoalSession(sessionId);
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      session.status = "paused";
      session.updatedAt = new Date().toISOString();
      saveGoalSession(session);

      appendAuditLine({ action: "goals.pause", resource: sessionId, ok: true });
      return NextResponse.json({ data: { session } });
    }

    if (action === "resume") {
      const { sessionId } = body as { sessionId?: string };
      if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

      const session = loadGoalSession(sessionId);
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      session.status = "active";
      session.updatedAt = new Date().toISOString();
      saveGoalSession(session);

      appendAuditLine({ action: "goals.resume", resource: sessionId, ok: true });
      return NextResponse.json({ data: { session } });
    }

    // ── Cancel ──────────────────────────────────────────────────
    if (action === "cancel") {
      const { sessionId } = body as { sessionId?: string };
      if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

      const session = loadGoalSession(sessionId);
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      session.status = "cancelled";
      session.updatedAt = new Date().toISOString();
      saveGoalSession(session);

      appendAuditLine({ action: "goals.cancel", resource: sessionId, ok: true });
      return NextResponse.json({ data: { session } });
    }

    // ── Check Mission Completion ─────────────────────────────────
    // Polls a sub-agent mission for GOAL_DONE marker
    if (action === "check-completion") {
      const { sessionId, goalIndex } = body as {
        sessionId?: string;
        goalIndex?: number;
      };

      if (!sessionId || goalIndex === undefined) {
        return NextResponse.json(
          { error: "sessionId and goalIndex are required" },
          { status: 400 }
        );
      }

      const session = loadGoalSession(sessionId);
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      const step = session.steps.find((s) => s.index === goalIndex);
      if (!step || !step.missionId) {
        return NextResponse.json({ error: "Step or linked mission not found" }, { status: 404 });
      }

      const mission = loadMission(step.missionId);
      const done = mission?.results?.includes("GOAL_DONE") ?? false;
      const failed = mission?.status === "failed";

      if (done) {
        const updated = advanceGoalSession(sessionId, goalIndex, "completed", step.missionId);
        return NextResponse.json({ data: { session: updated, goalDone: true } });
      }

      if (failed) {
        const updated = advanceGoalSession(
          sessionId,
          goalIndex,
          "failed",
          step.missionId,
          mission?.error ?? "Mission failed"
        );
        return NextResponse.json({ data: { session: updated, goalDone: false, failed: true } });
      }

      return NextResponse.json({
        data: { session, goalDone: false, inProgress: true },
      });
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
