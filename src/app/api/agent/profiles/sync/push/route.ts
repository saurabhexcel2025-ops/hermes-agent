import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { ensureDb } from "@/lib/db";
import { pushProfileToHermes, pushAllProfiles } from "@/lib/hermes-profile-sync";

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
  const all = body.all === true;
  const missingOnly = body.missingOnly === true;

  try {
    ensureDb();
    if (all || missingOnly) {
      const results = pushAllProfiles({
        onlyMissing: missingOnly,
        onlyOutOfSync: false,
      });
      return NextResponse.json({
        data: {
          success: results.every((r) => r.success),
          results,
        },
      });
    }

    if (!slug) {
      return NextResponse.json({ error: "slug or all=true required" }, { status: 400 });
    }

    const result = pushProfileToHermes(slug);
    return NextResponse.json({
      data: {
        success: result.success,
        result,
      },
    });
  } catch (error) {
    logApiError("POST /api/agent/profiles/sync/push", "push", error);
    return NextResponse.json({ error: "Failed to push profile" }, { status: 500 });
  }
}
