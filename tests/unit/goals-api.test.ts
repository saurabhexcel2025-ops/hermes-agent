// ═══════════════════════════════════════════════════════════════
// goals-api.test.ts — Unit tests for /api/goals route
// ═══════════════════════════════════════════════════════════════

/** @jest-environment node */

jest.mock("next/server", () => ({
  NextRequest: class NextRequest {
    url: string;
    method: string;
    headers: Headers;
    constructor(url: string, init?: RequestInit) {
      this.url = url;
      this.method = init?.method ?? "GET";
      this.headers = new Headers(init?.headers as HeadersInit);
    }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => {
      const status = init?.status ?? 200;
      const res = {
        ok: status >= 200 && status < 300,
        status,
        statusText:
          status === 201 ? "Created"
          : status === 400 ? "Bad Request"
          : status === 404 ? "Not Found"
          : status === 409 ? "Conflict"
          : "OK",
        headers: new Headers(),
        json: () => Promise.resolve(data),
      };
      return res;
    },
  },
}));

jest.mock("@/lib/api-auth", () => ({
  requireMcApiKey: jest.fn(() => null),
  requireNotReadOnly: jest.fn(() => null),
}));

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
}));

jest.mock("@/lib/audit-log", () => ({
  appendAuditLine: jest.fn(),
}));

jest.mock("@/lib/goal-session-repository", () => ({
  listGoalSessions: jest.fn(),
  listGoalSessionsByCard: jest.fn(),
  getGoalSession: jest.fn(),
  createGoalSession: jest.fn(),
  updateGoalSession: jest.fn(),
  updateGoalStep: jest.fn(),
  deleteGoalSession: jest.fn(),
  getActiveGoalSessionForCard: jest.fn(),
}));

jest.mock("@/lib/mission-repository", () => ({
  getMission: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockGoalsRepo = require("@/lib/goal-session-repository") as Record<string, jest.Mock>;

// ─── Types ───────────────────────────────────────────────────────────────────
type ApiRes = { status: number; ok: boolean; json(): Promise<Record<string, unknown>> };

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getRoute(path: string): Promise<ApiRes> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const route = require("@/app/api/goals/route") as { GET: (req: Request) => unknown };
  const req = { url: `http://localhost${path}`, method: "GET", headers: new Headers() } as unknown as Request;
  return route.GET(req) as unknown as ApiRes;
}

async function postRoute(body: Record<string, unknown>): Promise<ApiRes> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const route = require("@/app/api/goals/route") as { POST: (req: Request) => unknown };
  const req = {
    url: "http://localhost/api/goals",
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
    json: async () => body,
  } as unknown as Request;
  return route.POST(req) as unknown as ApiRes;
}

// ─── Shared test data ─────────────────────────────────────────────────────────

const SESSION_DATA = {
  id: "gs_test123",
  boardId: "board_abc",
  cardId: "card_xyz",
  goalLoopMode: "sequential" as const,
  goals: ["Goal One", "Goal Two", "Goal Three"],
  currentGoalIndex: 0,
  steps: [
    { index: 0, goal: "Goal One", status: "pending" as const, missionId: null, assignedProfileId: "bob", completedAt: null, error: null },
    { index: 1, goal: "Goal Two", status: "pending" as const, missionId: null, assignedProfileId: null, completedAt: null, error: null },
    { index: 2, goal: "Goal Three", status: "pending" as const, missionId: null, assignedProfileId: null, completedAt: null, error: null },
  ],
  status: "active" as const,
  coordinatorMissionId: null,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

// ─── GET /api/goals ──────────────────────────────────────────────────────────

describe("GET /api/goals", () => {
  beforeAll(() => {
    mockGoalsRepo.listGoalSessions.mockReturnValue([]);
    mockGoalsRepo.listGoalSessionsByCard.mockReturnValue([]);
    mockGoalsRepo.getGoalSession.mockReturnValue(null);
  });

  beforeEach(() => {
    mockGoalsRepo.listGoalSessions.mockClear();
    mockGoalsRepo.listGoalSessionsByCard.mockClear();
    mockGoalsRepo.getGoalSession.mockClear();
  });

  it("returns empty sessions list when none exist", async () => {
    mockGoalsRepo.listGoalSessions.mockReturnValue([]);
    const res = await getRoute("/api/goals");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect((data as Record<string, unknown>).data).toEqual({ sessions: [] });
  });

  it("returns sessions filtered by boardId", async () => {
    mockGoalsRepo.listGoalSessions.mockReturnValue([SESSION_DATA]);
    const res = await getRoute("/api/goals?boardId=board_abc");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect((data as Record<string, unknown>).data).toHaveProperty("sessions");
  });

  it("returns sessions filtered by cardId", async () => {
    mockGoalsRepo.listGoalSessionsByCard.mockReturnValue([SESSION_DATA]);
    const res = await getRoute("/api/goals?cardId=card_xyz");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect((data as Record<string, unknown>).data).toHaveProperty("sessions");
  });

  it("returns 404 when session id is not found", async () => {
    mockGoalsRepo.getGoalSession.mockReturnValue(null);
    const res = await getRoute("/api/goals?id=nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns a single session by id", async () => {
    mockGoalsRepo.getGoalSession.mockReturnValue(SESSION_DATA);
    const res = await getRoute("/api/goals?id=gs_test123");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect((data as Record<string, unknown>).data).toHaveProperty("session");
  });
});

// ─── POST /api/goals — start ─────────────────────────────────────────────────

describe("POST /api/goals — start", () => {
  beforeAll(() => {
    // Default: no existing sessions for any card
    mockGoalsRepo.listGoalSessionsByCard.mockReturnValue([]);
  });

  beforeEach(() => {
    mockGoalsRepo.listGoalSessionsByCard.mockClear();
  });

  it("creates a new goal session", async () => {
    mockGoalsRepo.listGoalSessionsByCard.mockReturnValue([]);
    mockGoalsRepo.createGoalSession.mockReturnValue(SESSION_DATA);
    const res = await postRoute({
      action: "start",
      boardId: "board_abc",
      cardId: "card_xyz",
      goalLoopMode: "sequential",
      goals: ["Goal One", "Goal Two", "Goal Three"],
    });
    expect(res.status).toBe(201);
  });

  it("rejects start without goals", async () => {
    const res = await postRoute({
      action: "start",
      boardId: "board_abc",
      cardId: "card_xyz",
      goalLoopMode: "sequential",
    });
    expect(res.status).toBe(400);
  });

  it("rejects start without boardId", async () => {
    const res = await postRoute({
      action: "start",
      cardId: "card_xyz",
      goals: ["Goal One"],
    });
    expect(res.status).toBe(400);
  });

  it("rejects start without cardId", async () => {
    const res = await postRoute({
      action: "start",
      boardId: "board_abc",
      goals: ["Goal One"],
    });
    expect(res.status).toBe(400);
  });

  it("rejects start without goalLoopMode", async () => {
    const res = await postRoute({
      action: "start",
      boardId: "board_abc",
      cardId: "card_xyz",
      goals: ["Goal One"],
    });
    expect(res.status).toBe(400);
  });

  it("rejects start when an active session already exists for the same card", async () => {
    mockGoalsRepo.listGoalSessionsByCard.mockReturnValue([SESSION_DATA]);
    const res = await postRoute({
      action: "start",
      boardId: "board_abc",
      cardId: "card_xyz",
      goals: ["Goal One"],
      goalLoopMode: "sequential",
    });
    expect(res.status).toBe(409);
  });

  it("allows start when only cancelled sessions exist for the same card", async () => {
    mockGoalsRepo.listGoalSessionsByCard.mockReturnValue([]);
    mockGoalsRepo.createGoalSession.mockReturnValue(SESSION_DATA);
    const res = await postRoute({
      action: "start",
      boardId: "board_abc",
      cardId: "card_xyz",
      goals: ["Goal One"],
      goalLoopMode: "parallel",
    });
    expect(res.status).toBe(201);
  });

  it("creates session in parallel mode", async () => {
    mockGoalsRepo.listGoalSessionsByCard.mockReturnValue([]);
    mockGoalsRepo.createGoalSession.mockReturnValue(SESSION_DATA);
    const res = await postRoute({
      action: "start",
      boardId: "board_abc",
      cardId: "card_xyz",
      goals: ["Goal One"],
      goalLoopMode: "parallel",
    });
    expect(res.status).toBe(201);
  });
});

// ─── POST /api/goals — advance ───────────────────────────────────────────────

describe("POST /api/goals — advance", () => {
  beforeAll(() => {
    mockGoalsRepo.updateGoalStep.mockReturnValue(SESSION_DATA);
  });

  afterEach(() => {
    mockGoalsRepo.updateGoalStep.mockClear();
  });

  it("advances a step to done and returns updated session", async () => {
    mockGoalsRepo.updateGoalStep.mockReturnValue(SESSION_DATA);
    const res = await postRoute({
      action: "advance",
      sessionId: "gs_test123",
      goalIndex: 0,
      status: "done",
    });
    expect(res.status).toBe(200);
  });

  it("marks session as failed when a step fails", async () => {
    mockGoalsRepo.updateGoalStep.mockReturnValue(SESSION_DATA);
    const res = await postRoute({
      action: "advance",
      sessionId: "gs_test123",
      goalIndex: 0,
      status: "failed",
      error: "Step failed",
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent session", async () => {
    mockGoalsRepo.updateGoalStep.mockReturnValue(null);
    const res = await postRoute({
      action: "advance",
      sessionId: "gs_nonexistent",
      goalIndex: 0,
      status: "done",
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when sessionId is missing", async () => {
    const res = await postRoute({
      action: "advance",
      goalIndex: 0,
      status: "done",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when goalIndex is missing", async () => {
    const res = await postRoute({
      action: "advance",
      sessionId: "gs_test123",
      status: "done",
    });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/goals — pause ─────────────────────────────────────────────────

describe("POST /api/goals — pause", () => {
  beforeAll(() => {
    mockGoalsRepo.updateGoalSession.mockReturnValue(SESSION_DATA);
  });

  afterEach(() => {
    mockGoalsRepo.updateGoalSession.mockClear();
  });

  it("pauses an active session", async () => {
    mockGoalsRepo.updateGoalSession.mockReturnValue(SESSION_DATA);
    const res = await postRoute({
      action: "pause",
      sessionId: "gs_test123",
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent session", async () => {
    mockGoalsRepo.updateGoalSession.mockReturnValue(null);
    const res = await postRoute({
      action: "pause",
      sessionId: "gs_nonexistent",
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when sessionId is missing", async () => {
    const res = await postRoute({ action: "pause" });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/goals — resume ───────────────────────────────────────────────

describe("POST /api/goals — resume", () => {
  beforeAll(() => {
    mockGoalsRepo.updateGoalSession.mockReturnValue(SESSION_DATA);
  });

  afterEach(() => {
    mockGoalsRepo.updateGoalSession.mockClear();
  });

  it("resumes a paused session", async () => {
    mockGoalsRepo.updateGoalSession.mockReturnValue(SESSION_DATA);
    const res = await postRoute({
      action: "resume",
      sessionId: "gs_test123",
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent session", async () => {
    mockGoalsRepo.updateGoalSession.mockReturnValue(null);
    const res = await postRoute({
      action: "resume",
      sessionId: "gs_nonexistent",
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when sessionId is missing", async () => {
    const res = await postRoute({ action: "resume" });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/goals — cancel ───────────────────────────────────────────────

describe("POST /api/goals — cancel", () => {
  beforeAll(() => {
    mockGoalsRepo.updateGoalSession.mockReturnValue(SESSION_DATA);
  });

  afterEach(() => {
    mockGoalsRepo.updateGoalSession.mockClear();
  });

  it("cancels an active session", async () => {
    mockGoalsRepo.updateGoalSession.mockReturnValue(SESSION_DATA);
    const res = await postRoute({ action: "cancel", sessionId: "gs_test123" });
    expect(res.status).toBe(200);
  });

  it("cancels a paused session", async () => {
    mockGoalsRepo.updateGoalSession.mockReturnValue(SESSION_DATA);
    const res = await postRoute({ action: "cancel", sessionId: "gs_test123" });
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent session", async () => {
    mockGoalsRepo.updateGoalSession.mockReturnValue(null);
    const res = await postRoute({ action: "cancel", sessionId: "gs_nonexistent" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when sessionId is missing", async () => {
    const res = await postRoute({ action: "cancel" });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/goals — delete ───────────────────────────────────────────────

describe("POST /api/goals — delete", () => {
  beforeAll(() => {
    mockGoalsRepo.deleteGoalSession.mockReturnValue(true);
  });

  afterEach(() => {
    mockGoalsRepo.deleteGoalSession.mockClear();
  });

  it("deletes an existing session", async () => {
    mockGoalsRepo.deleteGoalSession.mockReturnValue(true);
    const res = await postRoute({ action: "delete", sessionId: "gs_test123" });
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent session on delete", async () => {
    mockGoalsRepo.deleteGoalSession.mockReturnValue(false);
    const res = await postRoute({ action: "delete", sessionId: "gs_nonexistent" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when sessionId is missing for delete", async () => {
    const res = await postRoute({ action: "delete" });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/goals — unknown action ───────────────────────────────────────

describe("POST /api/goals — unknown action", () => {
  it("returns 400 for an unknown action", async () => {
    const res = await postRoute({ action: "invalid-action" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when action is missing", async () => {
    const res = await postRoute({});
    expect(res.status).toBe(400);
  });
});
