// ═══════════════════════════════════════════════════════════════
// Hermes Kanban API — Batch card operations
// ═══════════════════════════════════════════════════════════════
// POST /api/orchestration/hermes-kanban/batch
//
// Body: { cardIds: string[], operation:
//   { type: "statusChange", status: "ready"|"running"|"blocked"|"done" }
//   | { type: "archive" }
//   | { type: "assign", assignee: string } }
//
// Operates on the real Hermes kanban DB (~/.hermes/kanban.db)
// via the bridge library.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "../../../../../lib/api-auth";
import { logApiError } from "../../../../../lib/api-logger";
import { appendAuditLine } from "../../../../../lib/audit-log";
import {
  batchUpdateStatus,
  batchArchiveTasks,
  batchAssignTasks,
} from "../../../../../lib/hermes-kanban-bridge";

// ── Constants ───────────────────────────────────────────────────

/** Valid kanban statuses that batch operations can set. */
const CHANGEABLE_STATUSES = new Set([
  "todo",
  "ready",
  "running",
  "blocked",
  "done",
]);

// ── Request schema ──────────────────────────────────────────────

const batchRequestSchema = z.object({
  cardIds: z.array(z.string().min(1)).min(1).max(100),
  operation: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("statusChange"),
      status: z.string().min(1),
    }),
    z.object({ type: z.literal("archive") }),
    z.object({ type: z.literal("assign"), assignee: z.string().min(1) }),
  ]),
});

// ── Helpers ─────────────────────────────────────────────────────

function handleError(error: unknown, context: string) {
  logApiError("hermes-kanban", context, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Request failed" },
    { status: 500 },
  );
}

// ── Route handler ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = batchRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { cardIds, operation } = parsed.data;

  // Validate status value for statusChange operations
  if (operation.type === "statusChange") {
    if (!CHANGEABLE_STATUSES.has(operation.status)) {
      return NextResponse.json(
        {
          error: `Invalid status value '${operation.status}'. Must be one of: ${[...CHANGEABLE_STATUSES].join(", ")}`,
        },
        { status: 400 },
      );
    }
  }

  let result: { successCount: number; errors: Array<{ cardId: string; reason: string }> };

  try {
    if (operation.type === "statusChange") {
      result = batchUpdateStatus(cardIds, operation.status);
    } else if (operation.type === "archive") {
      result = await batchArchiveTasks(cardIds);
    } else {
      result = await batchAssignTasks(cardIds, operation.assignee);
    }
  } catch (err) {
    return handleError(err, `POST /batch ${operation.type}`);
  }

  const { successCount, errors } = result;
  const failureCount = errors.length;

  appendAuditLine({
    action: "kanban.batch",
    resource: "batch",
    ok: successCount > 0,
    detail: `op=${operation.type} success=${successCount} failed=${failureCount}`,
  });

  return NextResponse.json({ successCount, failureCount, errors });
}
