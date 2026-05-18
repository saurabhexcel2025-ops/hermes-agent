// ═══════════════════════════════════════════════════════════════
// Hermes Kanban API — Board stats for dashboard
// ═══════════════════════════════════════════════════════════════
// GET /api/orchestration/hermes-kanban/stats  — aggregated counts
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { logApiError } from "@/lib/api-logger";
import * as bridge from "@/lib/hermes-kanban-bridge";

function handleError(error: unknown, context: string) {
  logApiError("hermes-kanban", context, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Request failed" },
    { status: 500 },
  );
}

/** GET /api/orchestration/hermes-kanban/stats — aggregated board stats. */
export async function GET() {
  try {
    const summary = bridge.getBoardSummary();
    return NextResponse.json({ data: summary });
  } catch (error) {
    return handleError(error, "GET /api/orchestration/hermes-kanban/stats");
  }
}
