// ═══════════════════════════════════════════════════════════════
// Goals API — Checkpoint by ID
// ═══════════════════════════════════════════════════════════════
// PATCH  /api/orchestration/goals/[id]/checkpoints/[checkpointId]  — toggle
// DELETE /api/orchestration/goals/[id]/checkpoints/[checkpointId]  — remove
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

/** PATCH /api/orchestration/goals/[id]/checkpoints/[checkpointId] — toggle checkpoint. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; checkpointId: string }> },
) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { checkpointId } = await params;
    const id = Number(checkpointId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "checkpointId must be a number" }, { status: 400 });
    }

    const checkpoint = goals.toggleCheckpoint(id);
    if (!checkpoint) {
      return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
    }

    return NextResponse.json({ data: checkpoint });
  } catch (error) {
    return handleError(error, `PATCH checkpoint ${(await params).checkpointId}`);
  }
}

/** DELETE /api/orchestration/goals/[id]/checkpoints/[checkpointId] — remove checkpoint. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; checkpointId: string }> },
) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { checkpointId } = await params;
    const id = Number(checkpointId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "checkpointId must be a number" }, { status: 400 });
    }

    const ok = goals.removeCheckpoint(id);
    if (!ok) {
      return NextResponse.json({ error: "Checkpoint not found" }, { status: 404 });
    }

    return NextResponse.json({ data: { deleted: id } });
  } catch (error) {
    return handleError(error, `DELETE checkpoint ${(await params).checkpointId}`);
  }
}
