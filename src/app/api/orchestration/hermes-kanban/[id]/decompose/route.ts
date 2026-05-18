// ═══════════════════════════════════════════════════════════════
// Hermes Kanban API — Decompose a triage task (LLM breakdown)
// ═══════════════════════════════════════════════════════════════
// POST /api/orchestration/hermes-kanban/[id]/decompose
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

/** POST /api/orchestration/hermes-kanban/[id]/decompose — LLM-breakdown a triage task into child tasks. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { id } = await params;
    const result = await bridge.decomposeTask(id);
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleError(error, `POST [id]/decompose ${(await params).id}`);
  }
}
