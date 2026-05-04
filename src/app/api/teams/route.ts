import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════
// /api/teams — Team CRUD
// ═══════════════════════════════════════════════════════════════

import { requireMcApiKey, requireNotReadOnly } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { appendAuditLine } from "@/lib/audit-log";
import {
  ensureTeamsDir,
  loadTeam,
  saveTeam,
  deleteTeam,
  listTeams,
  newId,
} from "@/lib/teams-repository";
import type { Team, TeamMember } from "@/types/hermes";

// ── GET ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const teamId = url.searchParams.get("id");

  try {
    ensureTeamsDir();

    if (teamId) {
      const team = loadTeam(teamId);
      if (!team) {
        return NextResponse.json({ error: "Team not found" }, { status: 404 });
      }
      return NextResponse.json({ data: { team } });
    }

    const teams = listTeams();
    return NextResponse.json({ data: { teams } });
  } catch (error) {
    logApiError("GET /api/teams", teamId ? `team ${teamId}` : "listing teams", error);
    return NextResponse.json({ error: "Failed to load teams" }, { status: 500 });
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

    // ── Create Team ─────────────────────────────────────────────
    if (action === "create") {
      const { name, description, leaderProfileId, members } = body as {
        name?: string;
        description?: string;
        leaderProfileId?: string;
        members?: Array<{ profileId: string; role?: TeamMember["role"] }>;
      };

      if (!name || typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Team name is required" }, { status: 400 });
      }

      if (!leaderProfileId) {
        return NextResponse.json({ error: "Leader profile ID is required" }, { status: 400 });
      }

      const now = new Date().toISOString();
      const teamId = newId("team");

      const teamMembers: TeamMember[] = [
        {
          profileId: leaderProfileId.trim(),
          role: "leader",
          joinedAt: now,
        },
        ...(members ?? []).map((m) => ({
          profileId: m.profileId.trim(),
          role: (m.role as TeamMember["role"]) ?? "specialist",
          joinedAt: now,
        })),
      ];

      const team: Team = {
        id: teamId,
        name: name.trim(),
        description: (description ?? "").trim(),
        leaderProfileId: leaderProfileId.trim(),
        members: teamMembers,
        boardIds: [],
        createdAt: now,
        updatedAt: now,
      };

      saveTeam(team);
      appendAuditLine({ action: "team.create", resource: teamId, ok: true });
      return NextResponse.json({ data: { team } }, { status: 201 });
    }

    // ── Update Team ─────────────────────────────────────────────
    if (action === "update") {
      const { teamId, name, description, leaderProfileId } = body as {
        teamId?: string;
        name?: string;
        description?: string;
        leaderProfileId?: string;
      };

      if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });

      const team = loadTeam(teamId);
      if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

      if (name !== undefined) team.name = name.trim();
      if (description !== undefined) team.description = description.trim();
      if (leaderProfileId !== undefined) team.leaderProfileId = leaderProfileId.trim();
      team.updatedAt = new Date().toISOString();

      saveTeam(team);
      appendAuditLine({ action: "team.update", resource: teamId, ok: true });
      return NextResponse.json({ data: { team } });
    }

    // ── Add Member ─────────────────────────────────────────────
    if (action === "add-member") {
      const { teamId, profileId, role } = body as {
        teamId?: string;
        profileId?: string;
        role?: TeamMember["role"];
      };

      if (!teamId || !profileId) {
        return NextResponse.json({ error: "teamId and profileId are required" }, { status: 400 });
      }

      const team = loadTeam(teamId);
      if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

      if (team.members.some((m) => m.profileId === profileId)) {
        return NextResponse.json({ error: "Member already in team" }, { status: 409 });
      }

      team.members.push({
        profileId: profileId.trim(),
        role: (role as TeamMember["role"]) ?? "specialist",
        joinedAt: new Date().toISOString(),
      });
      team.updatedAt = new Date().toISOString();

      saveTeam(team);
      appendAuditLine({ action: "team.member.add", resource: teamId, ok: true });
      return NextResponse.json({ data: { team } });
    }

    // ── Remove Member ───────────────────────────────────────────
    if (action === "remove-member") {
      const { teamId, profileId } = body as { teamId?: string; profileId?: string };

      if (!teamId || !profileId) {
        return NextResponse.json({ error: "teamId and profileId are required" }, { status: 400 });
      }

      const team = loadTeam(teamId);
      if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

      team.members = team.members.filter((m) => m.profileId !== profileId);
      team.updatedAt = new Date().toISOString();

      saveTeam(team);
      appendAuditLine({ action: "team.member.remove", resource: teamId, ok: true });
      return NextResponse.json({ data: { team } });
    }

    // ── Link Board ──────────────────────────────────────────────
    if (action === "link-board") {
      const { teamId, boardId } = body as { teamId?: string; boardId?: string };

      if (!teamId || !boardId) {
        return NextResponse.json({ error: "teamId and boardId are required" }, { status: 400 });
      }

      const team = loadTeam(teamId);
      if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

      if (!team.boardIds.includes(boardId)) {
        team.boardIds.push(boardId);
        team.updatedAt = new Date().toISOString();
        saveTeam(team);
      }

      appendAuditLine({ action: "team.board.link", resource: teamId, ok: true });
      return NextResponse.json({ data: { team } });
    }

    // ── Delete Team ─────────────────────────────────────────────
    if (action === "delete") {
      const { teamId } = body as { teamId?: string };
      if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });

      const ok = deleteTeam(teamId);
      if (!ok) return NextResponse.json({ error: "Team not found" }, { status: 404 });

      appendAuditLine({ action: "team.delete", resource: teamId, ok: true });
      return NextResponse.json({ data: { deleted: teamId } });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    logApiError("POST /api/teams", "processing request", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
