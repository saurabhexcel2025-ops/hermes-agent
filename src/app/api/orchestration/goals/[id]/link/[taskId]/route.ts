// ═══════════════════════════════════════════════════════════════
// Goals API — Unlink a kanban task from a goal
// ═══════════════════════════════════════════════════════════════
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

/** DELETE /api/orchestration/goals/[id]/link/[taskId] — unlink a kanban task. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = requireAuth(_request);
  if (auth) return auth;

  try {
    const { id, taskId } = await params;

    const ok = goals.unlinkKanbanTask(id, taskId);
    if (!ok) {
      return NextResponse.json(
        { error: "Task link not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: { goal_id: id, task_id: taskId, unlinked: true } });
  } catch (error) {
    const paramsObj = await params;
    return handleError(error, `DELETE [id]/link/[taskId] ${paramsObj.id}/${paramsObj.taskId}`);
  }
}
