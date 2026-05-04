// ═══════════════════════════════════════════════════════════════
// kanban-api.test.ts — Unit tests for /api/kanban route
// ═══════════════════════════════════════════════════════════════

/** @jest-environment node */

// Mock next/server at top level to prevent Next.js internal module loading.
// Key: mock stores original data per response object so json() returns the
// actual response body without double-wrapping.

const mockWriteFileSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockUnlinkSync = jest.fn();

jest.mock("fs", () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  readdirSync: mockReaddirSync,
  unlinkSync: mockUnlinkSync,
}));

jest.mock("@/lib/hermes", () => ({
  HERMES_HOME: "/tmp/test-hermes",
  PATHS: { kanban: "/tmp/test-kanban", workspaces: "/tmp/test-workspaces" },
}));

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
  safeJsonParse: jest.fn((text: string) => {
    try { return JSON.parse(text); } catch { return null; }
  }),
  safeReadJsonFile: jest.fn((path: string) => {
    try { return JSON.parse(require("fs").readFileSync(path, "utf-8")); } catch { return null; }
  }),
}));

jest.mock("@/lib/audit-log", () => ({
  appendAuditLine: jest.fn(),
}));

// next/server mock — stores body per response so json() returns original data
const responseBodyMap = new WeakMap<object, unknown>();
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
        statusText: status === 201 ? "Created" : status === 400 ? "Bad Request" : status === 404 ? "Not Found" : status === 409 ? "Conflict" : "OK",
        headers: new Headers(),
        json: () => Promise.resolve(data), // returns original data directly
      };
      responseBodyMap.set(res, data);
      return res;
    },
  },
}));

// Pre-defined types to avoid SWC inline generic parsing issues
type ApiRes = { status: number; json(): Promise<Record<string, unknown>> };
type BoardsRes = { data: { boards: unknown[] } };
type BoardRes = { data: { board: { name: string; columnIds: string[] }; columns: unknown[] } };
type CardRes = { data: { card: { title: string } } };
type ColsRes = { data: { columns: Record<string, { cardIds: string[] }> } };
type ErrRes = { error: string };

function resetAll() {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
  mockMkdirSync.mockReturnValue(undefined);
  mockWriteFileSync.mockReturnValue(undefined);
  mockReaddirSync.mockReturnValue([]);
  mockUnlinkSync.mockReturnValue(undefined);
}

async function getRoute(path: string): Promise<ApiRes> {
  const { GET } = await import("@/app/api/kanban/route");
  const req = { url: `http://localhost${path}`, method: "GET", headers: new Headers() } as unknown as Request;
  return GET(req) as unknown as ApiRes;
}

async function postRoute(path: string, body: Record<string, unknown>): Promise<ApiRes> {
  const { POST } = await import("@/app/api/kanban/route");
  const req = {
    url: `http://localhost${path}`,
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
    json: async () => body,
  } as unknown as Request;
  return POST(req) as unknown as ApiRes;
}

describe("GET /api/kanban", () => {
  beforeEach(() => resetAll());

  it("returns an empty boards list when directory does not exist", async () => {
    mockExistsSync.mockImplementation((p: string) => p === "/tmp/test-kanban");
    const res = await getRoute("/api/kanban");
    const data = await res.json();
    expect((data as BoardsRes).data.boards).toEqual([]);
  });

  it("returns a specific board when ?id= is provided", async () => {
    resetAll();
    const boardData = {
      id: "board_test123",
      name: "Test Board",
      description: "",
      columnIds: [],
      teamId: "",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };

    mockExistsSync.mockImplementation((p: string) => p.includes(".board.json"));
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes(".board.json")) return JSON.stringify(boardData);
      if (p.includes(".columns.json")) return JSON.stringify({});
      if (p.includes(".cards.json")) return JSON.stringify({});
      return "{}";
    });

    const res = await getRoute("/api/kanban?id=board_test123");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect((data as BoardRes).data.board.name).toBe("Test Board");
  });

  it("returns 404 for a non-existent board", async () => {
    resetAll();
    mockExistsSync.mockReturnValue(false);
    const res = await getRoute("/api/kanban?id=nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/kanban — create-board", () => {
  beforeEach(() => resetAll());

  it("creates a new board with default columns", async () => {
    mockExistsSync.mockImplementation((p: string) => p === "/tmp/test-kanban");
    const res = await postRoute("/api/kanban", {
      action: "create-board",
      name: "Sprint Board",
      description: "Q2 Sprint",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect((data as BoardRes).data.board.name).toBe("Sprint Board");
    expect(Object.keys((data as BoardRes).data.columns).length).toBe(5);
  });

  it("rejects a board without a name", async () => {
    resetAll();
    const res = await postRoute("/api/kanban", {
      action: "create-board",
      description: "No name",
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect((data as ErrRes).error).toContain("name");
  });
});

describe("POST /api/kanban — add-card", () => {
  beforeEach(() => resetAll());

  it("adds a card to a column", async () => {
    const boardData = {
      id: "board_test123",
      name: "Test Board",
      description: "",
      columnIds: ["col1"],
      teamId: "",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    const colsData = {
      col1: { id: "col1", title: "To Do", color: "cyan" as const, position: 0, wipLimit: null, cardIds: [] },
    };

    mockExistsSync.mockImplementation((p: string) => p.includes(".board.json") || p.includes(".columns.json") || p.includes(".cards.json"));
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes(".board.json")) return JSON.stringify(boardData);
      if (p.includes(".columns.json")) return JSON.stringify(colsData);
      if (p.includes(".cards.json")) return JSON.stringify({});
      return "{}";
    });

    const res = await postRoute("/api/kanban", {
      action: "add-card",
      boardId: "board_test123",
      columnId: "col1",
      title: "My First Card",
      description: "Card description",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect((data as CardRes).data.card.title).toBe("My First Card");
  });

  it("rejects add-card without title", async () => {
    resetAll();
    const res = await postRoute("/api/kanban", {
      action: "add-card",
      boardId: "board_test123",
      columnId: "col1",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/kanban — move-card", () => {
  beforeEach(() => resetAll());

  it("moves a card to a different column", async () => {
    const boardData = {
      id: "board_test123",
      name: "Test Board",
      description: "",
      columnIds: ["col1", "col2"],
      teamId: "",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    const colsData = {
      col1: { id: "col1", title: "To Do", color: "cyan" as const, position: 0, wipLimit: null, cardIds: ["card1"] },
      col2: { id: "col2", title: "Done", color: "green" as const, position: 1, wipLimit: null, cardIds: [] },
    };
    const cardsData = {
      card1: { id: "card1", title: "Card", description: "", columnId: "col1", boardId: "board_test123", position: 0, status: "todo" as const, assigneeProfileId: null, goalIndices: [], missionIds: [], labels: [], createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" },
    };

    mockExistsSync.mockImplementation((p: string) => p.includes(".board.json") || p.includes(".columns.json") || p.includes(".cards.json"));
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes(".board.json")) return JSON.stringify(boardData);
      if (p.includes(".columns.json")) return JSON.stringify(colsData);
      if (p.includes(".cards.json")) return JSON.stringify(cardsData);
      return "{}";
    });

    const res = await postRoute("/api/kanban", {
      action: "move-card",
      boardId: "board_test123",
      cardId: "card1",
      toColumnId: "col2",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const cols = (data as ColsRes).data.columns;
    expect(cols.col1.cardIds).not.toContain("card1");
    expect(cols.col2.cardIds).toContain("card1");
  });
});

describe("POST /api/kanban — unknown action", () => {
  beforeEach(() => resetAll());

  it("returns 400 for an unknown action", async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await postRoute("/api/kanban", { action: "invalid-action" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect((data as ErrRes).error).toContain("Unknown action");
  });
});
