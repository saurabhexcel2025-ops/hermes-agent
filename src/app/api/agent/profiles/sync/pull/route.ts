import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { ensureDb } from "@/lib/db";
import { pullProfileFromHermes } from "@/lib/hermes-profile-sync";

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }

  const body = (raw ?? {}) as Record<string, unknown>;
  const slug = typeof body.slug === "string" ? body.slug : undefined;
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  try {
    ensureDb();
    const result = pullProfileFromHermes(slug);
    return NextResponse.json({
      data: {
        success: result.success,
        result,
      },
    });
  } catch (error) {
    logApiError("POST /api/agent/profiles/sync/pull", "pull", error);
    return NextResponse.json({ error: "Failed to pull profile" }, { status: 500 });
  }
}
