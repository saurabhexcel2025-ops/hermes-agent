/**
 * /api/organisations/route.ts
 * REST endpoint for organisations.
 *
 * GET    /api/organisations              — list all
 * POST   /api/organisations              — create
 * GET    /api/organisations/:id          — get one (with teams)
 * PATCH  /api/organisations/:id          — update
 * DELETE /api/organisations/:id          — soft-delete
 *
 * GET    /api/organisations/:id/teams/unassigned — teams not yet in org
 * POST   /api/organisations/:id/teams   — add a team
 * DELETE /api/organisations/:id/teams   — remove a team (via PUT body teamId)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createOrganisation,
  getOrganisation,
  listOrganisations,
  updateOrganisation,
  deleteOrganisation,
  addTeamToOrganisation,
  removeTeamFromOrganisation,
  listOrganisationTeams,
  listUnassignedTeams,
} from "@/lib/organisations-repository";
import { getProfile } from "@/lib/profile-repository";
import { getTeam } from "@/lib/teams-repository";
import { uuid } from "@/lib/db";

// ── Helpers ───────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function badRequest(message: string) {
  return json({ error: message }, 400);
}

function notFound(message = "Not found") {
  return json({ error: message }, 404);
}

function pathname(req: Request): string {
  return new URL(req.url).pathname;
}

function getOrgId(req: Request): string | null {
  const match = pathname(req).match(/^\/api\/organisations\/([^/]+)/);
  return match ? match[1] : null;
}

// ── GET /api/organisations ────────────────────────────────────

export async function GET(req: Request) {
  const url = pathname(req);
  const orgId = getOrgId(req);

  // GET /api/organisations/:id/teams/unassigned
  if (url.endsWith("/teams/unassigned") && orgId) {
    const org = getOrganisation(orgId);
    if (!org) return notFound();
    const teams = listUnassignedTeams(orgId);
    return json({ data: { teams } });
  }

  // GET /api/organisations/:id
  if (orgId) {
    const org = getOrganisation(orgId);
    if (!org) return notFound();
    const teams = listOrganisationTeams(orgId);
    return json({ ...org, teams });
  }

  // GET /api/organisations
  let orgs = listOrganisations();
  const { searchParams } = new URL(req.url);
  const leaderId = searchParams.get("leaderId");
  if (leaderId) {
    orgs = orgs.filter((o) => o.leaderId === leaderId);
  }
  return json(orgs);
}

// ── POST /api/organisations ───────────────────────────────────

export async function POST(req: Request) {
  const url = pathname(req);

  // POST /api/organisations/:id/teams
  if (url.match(/\/api\/organisations\/[^/]+\/teams$/) && req.method === "POST") {
    const orgId = getOrgId(req);
    if (!orgId) return badRequest("Missing organisation ID");
    const org = getOrganisation(orgId);
    if (!org) return notFound();

    let body: { teamId?: string; position?: number };
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const { teamId, position } = body;
    if (!teamId?.trim()) return badRequest("teamId is required");

    const team = getTeam(teamId);
    if (!team) return badRequest("Team does not exist");

    addTeamToOrganisation(orgId, teamId, position);
    const teams = listOrganisationTeams(orgId);
    return json({ ...org, teams }, 201);
  }

  // POST /api/organisations — create new org
  let body: { name?: string; description?: string; leaderId?: string; teamIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { name, description, leaderId, teamIds } = body;

  if (!name?.trim()) return badRequest("name is required");
  if (!leaderId?.trim()) return badRequest("leaderId is required");

  const leader = getProfile(leaderId);
  if (!leader) return badRequest("leaderId does not correspond to an existing profile");

  const id = uuid();
  const org = createOrganisation({ id, name: name.trim(), description: description?.trim() ?? "", leaderId });

  if (Array.isArray(teamIds) && teamIds.length > 0) {
    for (const teamId of teamIds) {
      const team = getTeam(teamId);
      if (!team) return badRequest(`Team '${teamId}' does not exist`);
      addTeamToOrganisation(org.id, teamId);
    }
  }

  return json(org, 201);
}

// ── PATCH /api/organisations/:id ──────────────────────────────

export async function PATCH(req: Request) {
  const orgId = getOrgId(req);
  if (!orgId) return badRequest("Missing organisation ID");

  const org = getOrganisation(orgId);
  if (!org) return notFound();

  let body: { name?: string; description?: string; leaderId?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { name, description, leaderId } = body;

  if (name !== undefined && !name.trim()) return badRequest("name cannot be empty");
  if (leaderId !== undefined) {
    const leader = getProfile(leaderId);
    if (!leader) return badRequest("leaderId does not correspond to an existing profile");
  }

  const updated = updateOrganisation(orgId, {
    name: name?.trim(),
    description: description?.trim(),
    leaderId,
  });

  return json(updated);
}

// ── DELETE /api/organisations/:id ─────────────────────────────

export async function DELETE(req: Request) {
  const orgId = getOrgId(req);
  if (!orgId) return badRequest("Missing organisation ID");

  const deleted = deleteOrganisation(orgId);
  if (!deleted) return notFound();
  return json({ success: true });
}

// ── PUT /api/organisations/:id/teams (remove team) ─────────────
// Next.js App Router doesn't support DELETE with body, so we use PUT.

export async function PUT(req: Request) {
  const orgId = getOrgId(req);
  if (!orgId) return badRequest("Missing organisation ID");

  const url = pathname(req);
  if (!url.endsWith("/teams")) return json({ error: "Method not allowed" }, 405);

  const org = getOrganisation(orgId);
  if (!org) return notFound();

  let body: { teamId?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { teamId } = body;
  if (!teamId?.trim()) return badRequest("teamId is required");

  const removed = removeTeamFromOrganisation(orgId, teamId);
  if (!removed) return notFound("Team is not a member of this organisation");

  return json({ success: true });
}
