/**
 * Integration tests for Hermes Kanban batch action flow.
 *
 * Validates that the page-level BatchOperationPayload → API body translation
 * works with the new Hermes kanban batch endpoint at
 * POST /api/orchestration/hermes-kanban/batch.
 *
 * Unlike the old /api/cards/batch endpoint (which targeted a now-removed
 * kanban_cards table in control-hub.db), this endpoint operates on the real
 * Hermes kanban DB (~/.hermes/kanban.db) via the bridge library.
 *
 * @jest-environment node
 */

jest.mock("@/lib/api-auth", () => ({
  requireAuth: jest.fn(() => null),
  requireMcApiKey: jest.fn(() => null),
  requireNotReadOnly: jest.fn(() => null),
}));

jest.mock("@/lib/api-logger", () => ({ logApiError: jest.fn() }));
jest.mock("@/lib/audit-log", () => ({ appendAuditLine: jest.fn() }));

// Mock the bridge — tests exercise the route's request-parsing and
// response-shaping logic without needing the real Hermes kanban DB or CLI.
jest.mock("@/lib/hermes-kanban-bridge", () => {
  const batchUpdateStatus = jest.fn();
  const batchArchiveTasks = jest.fn();
  const batchAssignTasks = jest.fn();
  return {
    batchUpdateStatus,
    batchArchiveTasks,
    batchAssignTasks,
    __batchUpdateStatus: batchUpdateStatus,
    __batchArchiveTasks: batchArchiveTasks,
    __batchAssignTasks: batchAssignTasks,
  };
});

import * as bridge from "@/lib/hermes-kanban-bridge";
import * as routeModule from "@/app/api/orchestration/hermes-kanban/batch/route";

function postBatch(body: unknown) {
  const route = routeModule;
  const req = {
    url: "http://localhost/api/orchestration/hermes-kanban/batch",
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  } as unknown as Request;
  return (route.POST(req) as Promise<{ status: number; json: () => Promise<unknown> }>).then(
    async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/orchestration/hermes-kanban/batch — page handler body shapes", () => {
  /**
   * handleBatchAction (hermes-kanban/page.tsx) builds the request body like this:
   *
   *   { cardIds, operation: { type: "statusChange", status } }  // change-status
   *   { cardIds, operation: { type: "archive" } }              // archive
   *   { cardIds, operation: { type: "assign", userId: "name" } }  // assign
   *
   * These tests verify each shape produces the correct API response.
   */

  describe("change-status", () => {
    it("returns 200 with correct counts for valid cards", async () => {
      bridge.__batchUpdateStatus.mockReturnValue({ successCount: 2, errors: [] });

      const res = await postBatch({
        cardIds: ["t_abc", "t_def"],
        operation: { type: "statusChange", status: "done" },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ successCount: 2, failureCount: 0, errors: [] });
      expect(bridge.__batchUpdateStatus).toHaveBeenCalledWith(["t_abc", "t_def"], "done");
    });

    it("uses correct Hermes-compatible status values", async () => {
      bridge.__batchUpdateStatus.mockReturnValue({ successCount: 1, errors: [] });

      for (const status of ["todo", "ready", "running", "blocked", "done"]) {
        const res = await postBatch({
          cardIds: ["t_abc"],
          operation: { type: "statusChange", status },
        });
        expect(res.status).toBe(200);
      }
    });

    it("returns 400 for invalid status value", async () => {
      const res = await postBatch({
        cardIds: ["t_abc"],
        operation: { type: "statusChange", status: "in-progress" },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for legacy status value 'review'", async () => {
      const res = await postBatch({
        cardIds: ["t_abc"],
        operation: { type: "statusChange", status: "review" },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("archive", () => {
    it("returns 200 with correct counts", async () => {
      bridge.__batchArchiveTasks.mockResolvedValue({ successCount: 2, errors: [] });

      const res = await postBatch({
        cardIds: ["t_arch_1", "t_arch_2"],
        operation: { type: "archive" },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ successCount: 2, failureCount: 0, errors: [] });
      expect(bridge.__batchArchiveTasks).toHaveBeenCalledWith(["t_arch_1", "t_arch_2"]);
    });
  });

  describe("assign", () => {
    it("returns 200 and calls batchAssignTasks with assignee", async () => {
      bridge.__batchAssignTasks.mockResolvedValue({ successCount: 1, errors: [] });

      const res = await postBatch({
        cardIds: ["t_assign_1"],
        operation: { type: "assign", assignee: "swe" },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ successCount: 1, failureCount: 0, errors: [] });
      expect(bridge.__batchAssignTasks).toHaveBeenCalledWith(["t_assign_1"], "swe");
    });
  });

  describe("partial failure — mixed existing and missing cards", () => {
    it("reports per-card errors and success for found ones", async () => {
      bridge.__batchUpdateStatus.mockReturnValue({
        successCount: 1,
        errors: [{ cardId: "t_missing_1", reason: "Task not found" }],
      });

      const res = await postBatch({
        cardIds: ["t_real_1", "t_missing_1"],
        operation: { type: "statusChange", status: "blocked" },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ successCount: 1, failureCount: 1 });
    });
  });

  describe("validation — bad request shapes", () => {
    it("returns 400 for empty cardIds array", async () => {
      const res = await postBatch({
        cardIds: [],
        operation: { type: "archive" },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for >100 cardIds", async () => {
      const res = await postBatch({
        cardIds: Array.from({ length: 101 }, (_, i) => `t_${i}`),
        operation: { type: "archive" },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing cardIds field", async () => {
      const res = await postBatch({
        operation: { type: "archive" },
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for unknown operation type", async () => {
      const res = await postBatch({
        cardIds: ["t_abc"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        operation: { type: "unknown_op" } as any,
      });
      expect(res.status).toBe(400);
    });
  });
});
