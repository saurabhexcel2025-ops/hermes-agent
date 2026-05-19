import { NextResponse } from "next/server";

import { logApiError } from "@/lib/api-logger";
import { ensureDb } from "@/lib/db";
import { detectAllProfileDrift } from "@/lib/hermes-profile-sync";

export async function GET() {
  try {
    ensureDb();
    const drift = detectAllProfileDrift();
    return NextResponse.json({ data: { drift } });
  } catch (error) {
    logApiError("GET /api/agent/profiles/sync/drift", "drift", error);
    return NextResponse.json({ error: "Failed to detect drift" }, { status: 500 });
  }
}
