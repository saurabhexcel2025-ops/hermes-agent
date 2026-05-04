// ═══════════════════════════════════════════════════════════════
// kanban-repository.test.ts — Unit tests for KanbanRepository
//
// Uses mockImplementation per-test (never mockReturnValue at top
// level) to avoid the mockReturnValue override problem:
//   mockReturnValue(null) overrides ALL mockImplementation,
//   so any mockImplementation set in a test is ignored.
// ═══════════════════════════════════════════════════════════════

/** @jest-environment node */

const mockWriteFileSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockUnlinkSync = jest.fn();

// Wrap unmocked readFileSync calls so safeJsonParse gets "{}" instead of crashing.
// safeJsonParse uses real fs.readFileSync at module import time — any path
// not explicitly stubbed in mockReadFileSync returns "{}", which is a safe empty object.
// readFileSync is called with (path, "utf-8") in the repository, returning string.
jest.mock("fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  readFileSync: (...args: unknown[]) => {
    const path = args[0] as string;
    // Called as readFileSync(path, "utf-8") — return string so JSON.parse succeeds
    const result = mockReadFileSync(path);
    if (result == null) return "{}"; // safe default for any unmocked path
    if (typeof result === "string") return result;
    return Buffer.from(result as string).toString("utf-8");
  },
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
}));

jest.mock("@/lib/hermes", () => ({
  PATHS: { kanban: "/tmp/test-kanban" },
}));

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
  // Use the real safeJsonParse so it reads through our mocked fs.readFileSync
  safeJsonParse: jest.requireActual("@/lib/api-logger").safeJsonParse,
}));

import {
  newId,
  loadBoard,
  saveBoard,
  deleteBoard,
  listBoards,
  loadColumns,
  saveColumns,
  loadCards,
  saveCards,
  loadKanbanDocument,
  ensureKanbanDir,
} from "@/lib/kanban-repository";
import type { KanbanBoard } from "@/types/hermes";

const BOARD_DATA: KanbanBoard = {
  id: "board_test123",
  name: "Test Board",
  description: "A test board",
  columnIds: ["col1"],
  teamId: "",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

// Per-test reset — only clears call history, never removes mockImplementation.
// Each test sets up exactly the mock behaviour it needs.
// Per-test reset using mockReset() — clears return values AND implementations.
// This is safe because each test sets up exactly what it needs.
beforeEach(() => {
  mockExistsSync.mockReset();
  mockMkdirSync.mockReset();
  mockWriteFileSync.mockReset();
  mockReadFileSync.mockReset();
  mockReaddirSync.mockReset();
  mockUnlinkSync.mockReset();
});

describe("newId", () => {
  it("starts with prefix and has underscore followed by base36 suffix", () => {
    const id = newId("board");
    // Format: prefix_timestamp36_randompart (ONE underscore total)
    expect(id.startsWith("board_")).toBe(true);
    // Suffix after the underscore must be non-empty base36
    const suffix = id.substring("board_".length);
    expect(suffix.length).toBeGreaterThanOrEqual(4);
    expect(/^[a-z0-9]+$/.test(suffix)).toBe(true);
  });

  it("generates unique IDs on successive calls", () => {
    const id1 = newId("card");
    const id2 = newId("card");
    expect(id1).not.toBe(id2);
  });
});

describe("ensureKanbanDir", () => {
  it("creates the kanban directory when it does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    ensureKanbanDir();
    expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/test-kanban", { recursive: true });
  });

  it("does nothing when the directory already exists", () => {
    mockExistsSync.mockReturnValue(true);
    ensureKanbanDir();
    expect(mockMkdirSync).not.toHaveBeenCalled();
  });
});

describe("loadBoard", () => {
  it("returns null for invalid/sanitised IDs", () => {
    expect(loadBoard("")).toBeNull();
    expect(loadBoard("board with spaces")).toBeNull();
  });

  it("returns null when the board file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadBoard("board_abc123")).toBeNull();
  });

  it("returns the parsed board when the file exists", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(BOARD_DATA));
    const result = loadBoard("board_test123");
    expect(result).toEqual(BOARD_DATA);
  });
});

describe("saveBoard", () => {
  it("writes the board JSON to the correct path", () => {
    saveBoard(BOARD_DATA);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/tmp/test-kanban/board_test123.board.json",
      JSON.stringify(BOARD_DATA, null, 2)
    );
  });
});

describe("deleteBoard", () => {
  it("returns true and deletes the file when it exists", () => {
    mockExistsSync.mockImplementation((p: string) => (p as string).includes("board_test123") ? true : false);
    const result = deleteBoard("board_test123");
    expect(result).toBe(true);
    expect(mockUnlinkSync).toHaveBeenCalled();
  });

  it("returns false when the file does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = deleteBoard("board_nonexistent");
    expect(result).toBe(false);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });
});

describe("listBoards", () => {
  it("returns empty array when directory is empty", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);
    expect(listBoards()).toEqual([]);
  });

  it("returns parsed boards sorted by updatedAt descending", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["board_old.board.json", "board_new.board.json"]);
    mockReadFileSync.mockImplementation((p: string) => {
      if ((p as string).includes("board_old")) {
        return JSON.stringify({ ...BOARD_DATA, id: "board_old", updatedAt: "2025-01-01T00:00:00.000Z" });
      }
      if ((p as string).includes("board_new")) {
        return JSON.stringify({ ...BOARD_DATA, id: "board_new", updatedAt: "2025-01-02T00:00:00.000Z" });
      }
      return undefined;
    });

    const boards = listBoards();
    expect(boards).toHaveLength(2);
    expect(boards[0].id).toBe("board_new"); // newer first
    expect(boards[1].id).toBe("board_old");
  });
});

describe("loadColumns / saveColumns", () => {
  it("loads columns map and writes it back unchanged", () => {
    mockExistsSync.mockReturnValue(true);
    const cols = {
      col1: { id: "col1", title: "To Do", color: "cyan", position: 0, wipLimit: null, cardIds: [] },
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(cols));

    const loaded = loadColumns("board_test123");
    expect(loaded).toEqual(cols);

    saveColumns("board_test123", cols);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/tmp/test-kanban/board_test123.columns.json",
      JSON.stringify(cols, null, 2)
    );
  });
});

describe("loadCards / saveCards", () => {
  it("loads cards map and writes it back unchanged", () => {
    mockExistsSync.mockReturnValue(true);
    const cards = {
      card1: {
        id: "card1", title: "Test Card", description: "", columnId: "col1",
        boardId: "board1", position: 0, status: "todo", assigneeProfileId: null,
        goalIndices: [], missionIds: [], labels: [],
        createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z",
      },
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(cards));

    const loaded = loadCards("board_test123");
    expect(loaded).toEqual(cards);

    saveCards("board_test123", cards);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/tmp/test-kanban/board_test123.cards.json",
      JSON.stringify(cards, null, 2)
    );
  });
});

describe("loadKanbanDocument", () => {
  it("returns null when the board does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadKanbanDocument("nonexistent")).toBeNull();
  });

  it("returns the full document with board, columns, and cards", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if ((p as string).includes(".board.json")) return JSON.stringify(BOARD_DATA);
      if ((p as string).includes(".columns.json")) return JSON.stringify({});
      if ((p as string).includes(".cards.json")) return JSON.stringify({});
      return undefined;
    });

    const doc = loadKanbanDocument("board_test123");
    expect(doc).not.toBeNull();
    expect(doc!.board).toEqual(BOARD_DATA);
    expect(doc!.columns).toEqual({});
    expect(doc!.cards).toEqual({});
  });
});
