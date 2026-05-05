// ═══════════════════════════════════════════════════════════════
// /api/profiles — AgentProfile CRUD (SQLite)
// Routes for listing, creating, updating, and deleting agent profiles.
// Storage is owned by Control Hub; Hermes is the default backend.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { requireMcApiKey, requireNotReadOnly } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { appendAuditLine } from "@/lib/audit-log";
import {
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
} from "@/lib/profile-repository";

// ── GET ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  try {
    if (id) {
      const profile = getProfile(id);
      if (!profile) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      return NextResponse.json({ data: { profile } });
    }

    const profiles = listProfiles();
    return NextResponse.json({ data: { profiles } });
  } catch (error) {
    logApiError("GET /api/profiles", id ? `profile ${id}` : "listing profiles", error);
    return NextResponse.json({ error: "Failed to load profiles" }, { status: 500 });
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

    // ── Create Profile ───────────────────────────────────────
    if (action === "create") {
      const { name, description, role, config } = body as {
        name?: string;
        description?: string;
        role?: string;
        config?: Record<string, unknown>;
      };

      if (!name || typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Profile name is required" }, { status: 400 });
      }

      const profile = createProfile({
        name: name.trim(),
        description: (description ?? "").trim(),
        role: role ?? "agent",
        config: config ?? {},
      });

      appendAuditLine({ action: "profile.create", resource: profile.id, ok: true });
      return NextResponse.json({ data: { profile } }, { status: 201 });
    }

    // ── Update Profile ───────────────────────────────────────
    if (action === "update") {
      const { id, name, description, role, config } = body as {
        id?: string;
        name?: string;
        description?: string;
        role?: string;
        config?: Record<string, unknown>;
      };

      if (!id) return NextResponse.json({ error: "Profile id is required" }, { status: 400 });

      const profile = updateProfile(id, {
        name: name?.trim(),
        description: description?.trim(),
        role,
        config,
      });

      if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

      appendAuditLine({ action: "profile.update", resource: id, ok: true });
      return NextResponse.json({ data: { profile } });
    }

    // ── Delete Profile ──────────────────────────────────────
    if (action === "delete") {
      const { id } = body as { id?: string };
      if (!id) return NextResponse.json({ error: "Profile id is required" }, { status: 400 });

      const ok = deleteProfile(id);
      if (!ok) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

      appendAuditLine({ action: "profile.delete", resource: id, ok: true });
      return NextResponse.json({ data: { deleted: id } });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    logApiError("POST /api/profiles", "processing request", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
