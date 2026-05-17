// ═══════════════════════════════════════════════════════════════
// Goals API — Link/unlink kanban tasks to a goal
// ═══════════════════════════════════════════════════════════════
// POST /api/orchestration/goals/[id]/link           — link a task
// DELETE /api/orchestration/goals/[id]/link/[taskId] — unlink a task
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import * as goals from "@/lib/goals-bridge";

function handleError(error: unknown, context: string) {
  logApiError("goals", context, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Request failed" },
    { status: 500 },
  );
}

/** POST /api/orchestration/goals/[id]/link — link a kanban task to a goal. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { task_id } = body;

    if (!task_id || typeof task_id !== "string") {
      return NextResponse.json(
        { error: "task_id is required" },
        { status: 400 },
      );
    }

    const ok = goals.linkKanbanTask(id, task_id);
    if (!ok) {
      return NextResponse.json(
        { error: "Failed to link task or task already linked" },
        { status: 409 },
      );
    }

    return NextResponse.json({ data: { goal_id: id, task_id, linked: true } });
  } catch (error) {
    return handleError(error, `POST [id]/link ${(await params).id}`);
  }
}
