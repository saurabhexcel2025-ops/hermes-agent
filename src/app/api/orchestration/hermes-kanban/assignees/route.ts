// ═══════════════════════════════════════════════════════════════
// Hermes Kanban API — Assignees endpoint
// ═══════════════════════════════════════════════════════════════
// GET /api/orchestration/hermes-kanban/assignees — list all
// available assignees (profiles) with task counts.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { logApiError } from "../../../../../lib/api-logger";
import * as bridge from "../../../../../lib/hermes-kanban-bridge";

function handleError(error: unknown, context: string) {
  logApiError("hermes-kanban", context, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Request failed" },
    { status: 500 },
  );
}

/** GET /api/orchestration/hermes-kanban/assignees — list assignees. */
export async function GET() {
  try {
    const data = await bridge.getAssignees();
    return NextResponse.json({ data });
  } catch (error) {
    return handleError(error, "GET /api/orchestration/hermes-kanban/assignees");
  }
}
