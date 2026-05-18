// ═══════════════════════════════════════════════════════════════
// Hermes Kanban API — Worker log viewer
// ═══════════════════════════════════════════════════════════════
// GET /api/orchestration/hermes-kanban/[id]/log
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../../../lib/api-auth";
import { logApiError } from "../../../../../../lib/api-logger";
import * as bridge from "../../../../../../lib/hermes-kanban-bridge";

function handleError(error: unknown, context: string) {
  logApiError("hermes-kanban", context, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Request failed" },
    { status: 500 },
  );
}

/** GET /api/orchestration/hermes-kanban/[id]/log — Worker execution log for a task. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await params;
    const log = await bridge.getTaskLogs(id);
    return NextResponse.json({ data: { log } });
  } catch (error) {
    return handleError(error, `GET [id]/log ${(await params).id}`);
  }
}
