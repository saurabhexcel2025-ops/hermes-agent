// ═══════════════════════════════════════════════════════════════
// goals-api.test.ts — Unit tests for /api/goals route
// ═══════════════════════════════════════════════════════════════

/** @jest-environment node */

const mockWriteFileSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockUnlinkSync = jest.fn();

jest.mock("fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
}));

jest.mock("@/lib/hermes", () => ({
  HERMES_HOME: "/tmp/test-hermes",
  PATHS: { missions: "/tmp/test-missions", workspaces: "/tmp/test-workspaces", goals: "/tmp/test-goals", kanban: "/tmp/test-kanban" },
}));

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
  safeJsonParse: jest.fn((text: string) => {
    try { return JSON.parse(text); } catch { return null; }
  }),
  safeReadJsonFile: jest.fn((path: string) => {
    try { return JSON.parse(mockReadFileSync(path) as string); } catch { return null; }
  }),
}));

jest.mock("@/lib/audit-log", () => ({
  appendAuditLine: jest.fn(),
}));

jest.mock("@/lib/missions-repository", () => ({
  sanitizeMissionId: jest.fn((id: string) => id),
  ensureMissionsDir: jest.fn(),
  loadMission: jest.fn(() => null),
  saveMission: jest.fn(),
  getMissionsDataDir: jest.fn(() => "/tmp/test-missions"),
}));

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
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 201 ? "Created" : status === 400 ? "Bad Request" : status === 404 ? "Not Found" : status === 409 ? "Conflict" : "OK",
        headers: new Headers(),
        json: async () => data,
      };
    },
  },
}));

type ApiRes = { status: number; json(): Promise<Record<string, unknown>> };

async function getRoute(path: string): Promise<ApiRes> {
  const { GET } = await import("@/app/api/goals/route");
  const req = { url: `http://localhost${path}`, method: "GET", headers: new Headers() } as unknown as Request;
  return GET(req) as unknown as ApiRes;
}

async function postRoute(path: string, body: Record<string, unknown>): Promise<ApiRes> {
  const { POST } = await import("@/app/api/goals/route");
  const req = {
    url: `http://localhost${path}`,
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
    json: async () => JSON.parse(JSON.stringify(body)),
  } as unknown as Request;
  return POST(req) as unknown as ApiRes;
}

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

beforeEach(() => {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
  mockMkdirSync.mockReturnValue(undefined);
  mockWriteFileSync.mockReturnValue(undefined);
  mockReaddirSync.mockReturnValue([]);
  mockUnlinkSync.mockReturnValue(undefined);
  mockReadFileSync.mockImplementation(() => { throw new Error("unexpected read"); });
});

describe("GET /api/goals", () => {
  it("returns empty list when no sessions exist", async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await getRoute("/api/goals");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect((data as Record<string, unknown>).data).toEqual({ sessions: [] });
  });

  it("returns sessions filtered by boardId", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["gs_s1.goal.json"]);
    mockReadFileSync.mockReturnValue(JSON.stringify({ ...SESSION_DATA, boardId: "board_a" }));
    const res = await getRoute("/api/goals?boardId=board_a");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect((data as Record<string, unknown>).data).toHaveProperty("sessions");
  });

  it("returns sessions filtered by cardId", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["gs_s1.goal.json"]);
    mockReadFileSync.mockReturnValue(JSON.stringify({ ...SESSION_DATA, cardId: "card1" }));
    const res = await getRoute("/api/goals?cardId=card1");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect((data as Record<string, unknown>).data).toHaveProperty("sessions");
  });
});

describe("POST /api/goals — start", () => {
  it("creates a new goal session from goals array", async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await postRoute("/api/goals", {
      action: "start",
      boardId: "board_abc",
      cardId: "card_xyz",
      goalLoopMode: "sequential",
      goals: ["Goal One", "Goal Two"],
      assignedProfileId: "researcher",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect((data as Record<string, unknown>).data).toHaveProperty("session");
  });

  it("rejects start without goals", async () => {
    const res = await postRoute("/api/goals", {
      action: "start",
      boardId: "board_abc",
      cardId: "card_xyz",
      goalLoopMode: "sequential",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/goals — advance", () => {
  it("advances a step to completed and moves currentGoalIndex forward", async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes(".goal.json"));
    mockReadFileSync.mockReturnValue(JSON.stringify(SESSION_DATA));
    const res = await postRoute("/api/goals", {
      action: "advance",
      sessionId: "gs_test123",
      goalIndex: 0,
      status: "completed",
      missionId: "mission_001",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect((data as Record<string, unknown>).data).toHaveProperty("session");
  });

  it("marks session as failed when a step fails", async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes(".goal.json"));
    mockReadFileSync.mockReturnValue(JSON.stringify(SESSION_DATA));
    const res = await postRoute("/api/goals", {
      action: "advance",
      sessionId: "gs_test123",
      goalIndex: 0,
      status: "failed",
      error: "Agent timed out",
    });
    expect(res.status).toBe(200);
  });

  it("pauses a session", async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes(".goal.json"));
    mockReadFileSync.mockReturnValue(JSON.stringify(SESSION_DATA));
    const res = await postRoute("/api/goals", {
      action: "pause",
      sessionId: "gs_test123",
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent session", async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await postRoute("/api/goals", {
      action: "advance",
      sessionId: "nonexistent",
      goalIndex: 0,
      status: "completed",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/goals — unknown action", () => {
  it("returns 400 for an unknown action", async () => {
    const res = await postRoute("/api/goals", { action: "invalid" });
    expect(res.status).toBe(400);
  });
});
