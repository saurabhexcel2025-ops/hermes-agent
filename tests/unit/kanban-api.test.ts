// ═══════════════════════════════════════════════════════════════
// kanban-api.test.ts — Unit tests for /api/kanban route
//
// Strategy: mock @/lib/kanban-repository directly so DefaultKanbanAdapter
// never touches the real database. Repository functions are sync, so
// mockReturnValue (not mockResolvedValue) is used throughout.
//
// jest.mock() is hoisted above all imports; all mock factories run
// before any module is evaluated. This ensures the mock is active
// when the route module first imports kanban-repository.
// ═══════════════════════════════════════════════════════════════

/** @jest-environment node */

// ─── Mock next/server ───────────────────────────────────────────────────────────
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

// ─── Mock kanban-repository — inline factory ensures mock object is ready ──────
jest.mock("@/lib/kanban-repository", () => ({
  listBoards: jest.fn(),
  getBoard: jest.fn(),
  createBoard: jest.fn(),
  updateBoard: jest.fn(),
  deleteBoard: jest.fn(),
  listColumns: jest.fn(),
  getColumn: jest.fn(),
  createColumn: jest.fn(),
  updateColumn: jest.fn(),
  deleteColumn: jest.fn(),
  listCards: jest.fn(),
  getCard: jest.fn(),
  createCard: jest.fn(),
  updateCard: jest.fn(),
  moveCard: jest.fn(),
  deleteCard: jest.fn(),
  loadKanbanDocument: jest.fn(),
  ensureDefaultBoard: jest.fn(),
  deriveStatusFromColumn: jest.fn(),
}));

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
  safeJsonParse: jest.fn((text: string) => {
    try { return JSON.parse(text); } catch { return null; }
  }),
  safeReadJsonFile: jest.fn(() => null),
}));

jest.mock("@/lib/audit-log", () => ({
  appendAuditLine: jest.fn(),
}));

jest.mock("@/lib/kanban-adapter/agent-bridge", () => ({
  dispatchKanbanCard: jest.fn().mockResolvedValue(null),
}));

// ─── Import mock after jest.mock() declarations — type-only import ─────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockRepo = require("@/lib/kanban-repository") as Record<string, jest.Mock>;

// ─── Types ────────────────────────────────────────────────────────────────────
type ApiRes = { status: number; ok: boolean; json(): Promise<Record<string, unknown>> };
type BoardsRes = { data: { boards: unknown[] } };
type BoardRes = { data: { board: unknown; columns: unknown } };
type CardRes = { data: { card: unknown } };
type ErrRes = { error: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getRoute(path: string): Promise<ApiRes> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const route = require("@/app/api/kanban/route") as { GET: (req: Request) => unknown };
  const req = { url: `http://localhost${path}`, method: "GET", headers: new Headers() } as unknown as Request;
  return route.GET(req) as unknown as ApiRes;
}

async function postRoute(path: string, body: Record<string, unknown>): Promise<ApiRes> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const route = require("@/app/api/kanban/route") as { POST: (req: Request) => unknown };
  const req = {
    url: `http://localhost${path}`,
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
    json: async () => body,
  } as unknown as Request;
  return route.POST(req) as unknown as ApiRes;
}

// ─── Shared test data ─────────────────────────────────────────────────────────

const TEST_BOARD = {
  id: "board_test123",
  name: "Test Board",
  description: "",
  columnIds: ["col1", "col2"],
  teamId: null,
  accentColor: "cyan" as const,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const TEST_COLUMNS = {
  col1: { id: "col1", boardId: "board_test123", title: "To Do", color: "cyan" as const, position: 0, wipLimit: null, cardIds: ["card1"] },
  col2: { id: "col2", boardId: "board_test123", title: "Done", color: "green" as const, position: 1, wipLimit: null, cardIds: [] },
};

const TEST_CARD = {
  id: "card1",
  boardId: "board_test123",
  columnId: "col1",
  title: "My First Card",
  description: "Card description",
  position: 0,
  status: "todo" as const,
  assigneeProfileId: null,
  goalIndices: [],
  missionIds: [],
  labels: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

// ─── GET /api/kanban ────────────────────────────────────────────────────────────

describe("GET /api/kanban", () => {
  it("returns an empty boards list when no boards exist", async () => {
    mockRepo.listBoards.mockReturnValue([]);

    const res = await getRoute("/api/kanban");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect((data as BoardsRes).data.boards).toEqual([]);
  });

  it("returns a specific board when ?id= is provided", async () => {
    mockRepo.getBoard.mockReturnValue(TEST_BOARD);
    mockRepo.listColumns.mockReturnValue(Object.values(TEST_COLUMNS));
    mockRepo.listCards.mockReturnValue([TEST_CARD]);
    mockRepo.loadKanbanDocument.mockReturnValue({
      board: TEST_BOARD,
      columns: TEST_COLUMNS,
      cards: { card1: TEST_CARD },
    });

    const res = await getRoute("/api/kanban?id=board_test123");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect((data as BoardRes).data.board).toMatchObject({ id: "board_test123", name: "Test Board" });
    expect((data as BoardRes).data.columns).toHaveProperty("col1");
    expect((data as BoardRes).data.columns).toHaveProperty("col2");
  });

  it("returns 404 for a non-existent board", async () => {
    mockRepo.getBoard.mockReturnValue(null);
    mockRepo.loadKanbanDocument.mockReturnValue(null);

    const res = await getRoute("/api/kanban?id=nonexistent");
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/kanban — create-board ──────────────────────────────────────────

describe("POST /api/kanban — create-board", () => {
  it("creates a new board with default columns", async () => {
    mockRepo.createBoard.mockReturnValue({ ...TEST_BOARD, id: "new_board_id", name: "Sprint Board" });
    mockRepo.createColumn
      .mockReturnValueOnce({ id: "c1", boardId: "new_board_id", title: "To Do", color: "cyan", position: 0, wipLimit: null })
      .mockReturnValueOnce({ id: "c2", boardId: "new_board_id", title: "In Progress", color: "yellow", position: 1, wipLimit: null })
      .mockReturnValueOnce({ id: "c3", boardId: "new_board_id", title: "Done", color: "green", position: 2, wipLimit: null })
      .mockReturnValueOnce({ id: "c4", boardId: "new_board_id", title: "Backlog", color: "gray", position: 3, wipLimit: null })
      .mockReturnValueOnce({ id: "c5", boardId: "new_board_id", title: "Review", color: "purple", position: 4, wipLimit: null });
    mockRepo.listColumns.mockReturnValue([]);
    mockRepo.listCards.mockReturnValue([]);
    mockRepo.loadKanbanDocument.mockReturnValue({
      board: { ...TEST_BOARD, id: "new_board_id", name: "Sprint Board" },
      columns: {},
      cards: {},
    });

    const res = await postRoute("/api/kanban", {
      action: "create-board",
      name: "Sprint Board",
      description: "Q2 Sprint",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect((data as BoardRes).data.board).toMatchObject({ name: "Sprint Board" });
    expect(Object.keys((data as BoardRes).data.columns).length).toBe(5);
  });

  it("rejects a board without a name", async () => {
    const res = await postRoute("/api/kanban", {
      action: "create-board",
      description: "No name",
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect((data as ErrRes).error).toContain("name");
  });
});

// ─── POST /api/kanban — add-card ───────────────────────────────────────────────

describe("POST /api/kanban — add-card", () => {
  it("adds a card to a column", async () => {
    mockRepo.getBoard.mockReturnValue(TEST_BOARD);
    mockRepo.getColumn.mockReturnValue({ id: "col1", boardId: "board_test123", title: "To Do", color: "cyan", position: 0, wipLimit: null });
    mockRepo.listCards.mockReturnValue([]);
    mockRepo.createCard.mockReturnValue({ ...TEST_CARD, id: "new_card_id" });
    mockRepo.loadKanbanDocument.mockReturnValue({
      board: TEST_BOARD,
      columns: TEST_COLUMNS,
      cards: { new_card_id: { ...TEST_CARD, id: "new_card_id" } },
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
    expect((data as CardRes).data.card).toMatchObject({ title: "My First Card", description: "Card description" });
  });

  it("rejects add-card without title", async () => {
    const res = await postRoute("/api/kanban", {
      action: "add-card",
      boardId: "board_test123",
      columnId: "col1",
    });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/kanban — move-card ─────────────────────────────────────────────

describe("POST /api/kanban — move-card", () => {
  // Set defaults so mockReturnValue persists across tests
  beforeAll(() => {
    mockRepo.moveCard.mockReturnValue({ ...TEST_CARD, columnId: "col2" });
    mockRepo.loadKanbanDocument.mockReturnValue({
      board: { ...TEST_BOARD },
      columns: {
        col1: { ...TEST_COLUMNS.col1, cardIds: [] },
        col2: { ...TEST_COLUMNS.col2, cardIds: ["card1"] },
      },
      cards: { card1: { ...TEST_CARD, columnId: "col2" } },
    });
  });

  afterEach(() => {
    mockRepo.moveCard.mockClear();
    mockRepo.loadKanbanDocument.mockClear();
  });

  it("moves a card to a different column", async () => {
    mockRepo.getBoard.mockReturnValue(TEST_BOARD);
    mockRepo.getCard.mockReturnValue(TEST_CARD);
    mockRepo.getColumn
      .mockReturnValueOnce({ id: "col1", boardId: "board_test123", title: "To Do", color: "cyan", position: 0, wipLimit: null })
      .mockReturnValueOnce({ id: "col2", boardId: "board_test123", title: "Done", color: "green", position: 1, wipLimit: null });
    mockRepo.listCards.mockReturnValue([TEST_CARD]);

    const res = await postRoute("/api/kanban", {
      action: "move-card",
      boardId: "board_test123",
      cardId: "card1",
      toColumnId: "col2",
    });
type MoveCardRes = { data: { board: { columns: Record<string, { cardIds: string[] }> } } };

    expect(res.status).toBe(200);
    const data = await res.json();
    // Route returns { data: { card, board: { board, columns, cards }, ... } }
    const cols = (data as MoveCardRes).data.board.columns;
    expect(cols.col1.cardIds).not.toContain("card1");
    expect(cols.col2.cardIds).toContain("card1");
  });
});

// ─── POST /api/kanban — unknown action ────────────────────────────────────────

describe("POST /api/kanban — unknown action", () => {
  it("returns 400 for an unknown action", async () => {
    const res = await postRoute("/api/kanban", { action: "invalid-action" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect((data as ErrRes).error).toContain("Unknown action");
  });
});
