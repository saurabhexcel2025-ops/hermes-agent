// ═══════════════════════════════════════════════════════════════
// /api/missions — Mission CRUD + dispatch (SQLite)
// ═══════════════════════════════════════════════════════════════
// Missions are stored in Control Hub SQLite. Dispatch is handled
// by the AgentBackend so any agent backend can run missions.
import { NextRequest, NextResponse } from "next/server";
import { getMission, listMissions, createMission, updateMission, deleteMission } from "@/lib/mission-repository";
import { requireMcApiKey, requireNotReadOnly } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { appendAuditLine } from "@/lib/audit-log";
import type { MissionStatus } from "@/lib/agent-backend/types";
import { agentBackend } from "@/lib/backends";

// ── GET ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  try {
    if (id) {
      const mission = getMission(id);
      if (!mission) {
        return NextResponse.json({ error: "Mission not found" }, { status: 404 });
      }
      return NextResponse.json({ data: { mission } });
    }

    const missions = listMissions();
    return NextResponse.json({ data: { missions } });
  } catch (error) {
    logApiError("GET /api/missions", id ? `mission ${id}` : "listing missions", error);
    return NextResponse.json({ error: "Failed to load missions" }, { status: 500 });
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

    // ── Dispatch Mission ────────────────────────────────────────
    if (action === "dispatch") {
      const { name, prompt, profileId } = body as {
        name?: string;
        prompt?: string;
        profileId?: string;
      };

      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return NextResponse.json({ error: "prompt is required" }, { status: 400 });
      }

      // Create mission record first
      const mission = createMission({
        name: (name as string)?.trim() || "Untitled Mission",
        prompt: prompt.trim(),
        profileId,
      });

      // Update to running
      updateMission(mission.id, { status: "running" });

      // Dispatch via agent backend (non-blocking)
      try {
        const dispatched = await agentBackend.dispatchMission({
          name: mission.name,
          prompt: mission.prompt,
          profileId: mission.profileId,
        });
        updateMission(mission.id, {
          sessionId: dispatched.sessionId,
          status: "running",
        });
      } catch (err) {
        logApiError("POST /api/missions", "dispatch", err);
        updateMission(mission.id, { status: "failed" });
      }

      appendAuditLine({ action: "mission.dispatch", resource: mission.id, ok: true });
      return NextResponse.json({ data: { mission: getMission(mission.id) } }, { status: 201 });
    }

    // ── Update Mission ─────────────────────────────────────────
    if (action === "update") {
      const { id, missionId, status, result } = body as {
        id?: string;
        missionId?: string;
        status?: string;
        result?: string;
      };
      const missionIdFinal = id ?? missionId;
      if (!missionIdFinal) return NextResponse.json({ error: "Mission id is required" }, { status: 400 });

      const updates: { status?: MissionStatus; result?: string } = {};
      if (status) updates.status = status as MissionStatus;
      if (result !== undefined) updates.result = result;

      const mission = updateMission(missionIdFinal, updates);
      if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

      appendAuditLine({ action: "mission.update", resource: missionIdFinal, ok: true });
      return NextResponse.json({ data: { mission } });
    }

    // ── Cancel Mission ─────────────────────────────────────────
    if (action === "cancel") {
      const { id } = body as { id?: string };
      if (!id) return NextResponse.json({ error: "Mission id is required" }, { status: 400 });

      const mission = updateMission(id, { status: "cancelled" });
      if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

      appendAuditLine({ action: "mission.cancel", resource: id, ok: true });
      return NextResponse.json({ data: { mission } });
    }

    // ── Delete Mission ─────────────────────────────────────────
    if (action === "delete") {
      const { id, missionId } = body as { id?: string; missionId?: string };
      const missionIdFinal = id ?? missionId;
      if (!missionIdFinal) return NextResponse.json({ error: "Mission id is required" }, { status: 400 });

      const ok = deleteMission(missionIdFinal);
      if (!ok) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

      appendAuditLine({ action: "mission.delete", resource: missionIdFinal, ok: true });
      return NextResponse.json({ data: { deleted: missionIdFinal } });
    }

    // ── Get Status ────────────────────────────────────────────
    if (action === "status") {
      const { id } = body as { id?: string };
      if (!id) return NextResponse.json({ error: "Mission id is required" }, { status: 400 });

      const status = await agentBackend.getMissionStatus(id);
      return NextResponse.json({ data: { status } });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    logApiError("POST /api/missions", "processing request", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
