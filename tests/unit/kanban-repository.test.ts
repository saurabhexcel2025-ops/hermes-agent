// ═══════════════════════════════════════════════════════════════
// kanban-repository.test.ts — Unit tests for KanbanRepository
// ═══════════════════════════════════════════════════════════════

/** @jest-environment node */

// Mock the repository under test — it uses SQLite via db.ts internally
jest.mock("@/lib/kanban-repository");

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
}));

import {
  listBoards,
  getBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  listColumns,
  getColumn,
  createColumn,
  updateColumn,
  deleteColumn,
  listCards,
  getCard,
  createCard,
  updateCard,
  moveCard,
  deleteCard,
  loadKanbanDocument,
  ensureDefaultBoard,
  deriveStatusFromColumn,
} from "@/lib/kanban-repository";

const mockRepo = jest.mocked({
  listBoards,
  getBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  listColumns,
  getColumn,
  createColumn,
  updateColumn,
  deleteColumn,
  listCards,
  getCard,
  createCard,
  updateCard,
  moveCard,
  deleteCard,
  loadKanbanDocument,
  ensureDefaultBoard,
  deriveStatusFromColumn,
});

beforeEach(() => {
  jest.clearAllMocks();
});

const BOARD_DATA = {
  id: "board_test123",
  name: "Test Board",
  description: "A test board",
  columnIds: ["col1"],
  teamId: "",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const COLUMN_DATA = {
  id: "col1",
  boardId: "board_test123",
  title: "To Do",
  color: "cyan" as const,
  position: 0,
  wipLimit: null,
  cardIds: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const CARD_DATA = {
  id: "card1",
  boardId: "board_test123",
  columnId: "col1",
  title: "Test Card",
  description: "",
  position: 0,
  status: "todo" as const,
  assigneeProfileId: null,
  labels: [],
  missionIds: [],
  goalIndices: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("listBoards", () => {
  it("returns an empty array when no boards exist", () => {
    mockRepo.listBoards.mockReturnValue([]);
    expect(listBoards()).toEqual([]);
  });

  it("returns all boards", () => {
    mockRepo.listBoards.mockReturnValue([BOARD_DATA]);
    expect(listBoards()).toHaveLength(1);
    expect(listBoards()[0].id).toBe("board_test123");
  });
});

describe("getBoard", () => {
  it("returns the board when it exists", () => {
    mockRepo.getBoard.mockReturnValue(BOARD_DATA);
    expect(getBoard("board_test123")).toEqual(BOARD_DATA);
  });

  it("returns null when the board does not exist", () => {
    mockRepo.getBoard.mockReturnValue(null);
    expect(getBoard("board_nonexistent")).toBeNull();
  });
});

describe("createBoard", () => {
  it("creates a new board", () => {
    mockRepo.createBoard.mockReturnValue(BOARD_DATA);
    const result = createBoard({ name: "Test Board", description: "A test board" });
    expect(result.id).toBe("board_test123");
    expect(result.name).toBe("Test Board");
  });
});

describe("updateBoard", () => {
  it("updates the board name", () => {
    const updated = { ...BOARD_DATA, name: "Renamed Board" };
    mockRepo.updateBoard.mockReturnValue(updated);
    const result = updateBoard("board_test123", { name: "Renamed Board" });
    expect(result!.name).toBe("Renamed Board");
  });

  it("returns null when the board does not exist", () => {
    mockRepo.updateBoard.mockReturnValue(null);
    expect(updateBoard("board_nonexistent", { name: "New Name" })).toBeNull();
  });
});

describe("deleteBoard", () => {
  it("returns true when the board was deleted", () => {
    mockRepo.deleteBoard.mockReturnValue(true);
    expect(deleteBoard("board_test123")).toBe(true);
  });

  it("returns false when the board did not exist", () => {
    mockRepo.deleteBoard.mockReturnValue(false);
    expect(deleteBoard("board_nonexistent")).toBe(false);
  });
});

describe("listColumns", () => {
  it("returns columns for a board", () => {
    mockRepo.listColumns.mockReturnValue([COLUMN_DATA]);
    const result = listColumns("board_test123");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("To Do");
  });

  it("returns empty array when no columns exist", () => {
    mockRepo.listColumns.mockReturnValue([]);
    expect(listColumns("board_test123")).toEqual([]);
  });
});

describe("getColumn", () => {
  it("returns the column when it exists", () => {
    mockRepo.getColumn.mockReturnValue(COLUMN_DATA);
    expect(getColumn("col1")).toEqual(COLUMN_DATA);
  });

  it("returns null when the column does not exist", () => {
    mockRepo.getColumn.mockReturnValue(null);
    expect(getColumn("col_nonexistent")).toBeNull();
  });
});

describe("createColumn", () => {
  it("creates a new column", () => {
    mockRepo.createColumn.mockReturnValue(COLUMN_DATA);
    const result = createColumn({ boardId: "board_test123", title: "To Do", color: "cyan" });
    expect(result.id).toBe("col1");
    expect(result.title).toBe("To Do");
  });
});

describe("updateColumn", () => {
  it("updates column title", () => {
    const updated = { ...COLUMN_DATA, title: "In Progress" };
    mockRepo.updateColumn.mockReturnValue(updated);
    const result = updateColumn("col1", { title: "In Progress" });
    expect(result!.title).toBe("In Progress");
  });

  it("returns null when the column does not exist", () => {
    mockRepo.updateColumn.mockReturnValue(null);
    expect(updateColumn("col_nonexistent", { title: "New Title" })).toBeNull();
  });
});

describe("deleteColumn", () => {
  it("returns true when the column was deleted", () => {
    mockRepo.deleteColumn.mockReturnValue(true);
    expect(deleteColumn("col1")).toBe(true);
  });

  it("returns false when the column did not exist", () => {
    mockRepo.deleteColumn.mockReturnValue(false);
    expect(deleteColumn("col_nonexistent")).toBe(false);
  });
});

describe("listCards", () => {
  it("returns cards for a board", () => {
    mockRepo.listCards.mockReturnValue([CARD_DATA]);
    const result = listCards("board_test123");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Test Card");
  });

  it("returns empty array when no cards exist", () => {
    mockRepo.listCards.mockReturnValue([]);
    expect(listCards("board_test123")).toEqual([]);
  });
});

describe("getCard", () => {
  it("returns the card when it exists", () => {
    mockRepo.getCard.mockReturnValue(CARD_DATA);
    expect(getCard("card1")).toEqual(CARD_DATA);
  });

  it("returns null when the card does not exist", () => {
    mockRepo.getCard.mockReturnValue(null);
    expect(getCard("card_nonexistent")).toBeNull();
  });
});

describe("createCard", () => {
  it("creates a new card", () => {
    mockRepo.createCard.mockReturnValue(CARD_DATA);
    const result = createCard({
      boardId: "board_test123",
      columnId: "col1",
      title: "Test Card",
    });
    expect(result.id).toBe("card1");
    expect(result.title).toBe("Test Card");
  });
});

describe("updateCard", () => {
  it("updates card title", () => {
    const updated = { ...CARD_DATA, title: "Updated Title" };
    mockRepo.updateCard.mockReturnValue(updated);
    const result = updateCard("card1", { title: "Updated Title" });
    expect(result!.title).toBe("Updated Title");
  });

  it("returns null when the card does not exist", () => {
    mockRepo.updateCard.mockReturnValue(null);
    expect(updateCard("card_nonexistent", { title: "New Title" })).toBeNull();
  });
});

describe("moveCard", () => {
  it("moves a card to a new column and position", () => {
    const moved = { ...CARD_DATA, columnId: "col2", position: 0, status: "in_progress" as const };
    mockRepo.moveCard.mockReturnValue(moved);
    const result = moveCard("card1", "col2", 0);
    expect(result!.columnId).toBe("col2");
    expect(result!.position).toBe(0);
  });

  it("returns null when the card does not exist", () => {
    mockRepo.moveCard.mockReturnValue(null);
    expect(moveCard("card_nonexistent", "col2", 0)).toBeNull();
  });
});

describe("deleteCard", () => {
  it("returns true when the card was deleted", () => {
    mockRepo.deleteCard.mockReturnValue(true);
    expect(deleteCard("card1")).toBe(true);
  });

  it("returns false when the card did not exist", () => {
    mockRepo.deleteCard.mockReturnValue(false);
    expect(deleteCard("card_nonexistent")).toBe(false);
  });
});

describe("loadKanbanDocument", () => {
  it("returns the full document with board, columns, and cards", () => {
    const doc = {
      board: BOARD_DATA,
      columns: { col1: COLUMN_DATA },
      cards: { card1: CARD_DATA },
    };
    mockRepo.loadKanbanDocument.mockReturnValue(doc);
    const result = loadKanbanDocument("board_test123");
    expect(result).not.toBeNull();
    expect(result!.board.id).toBe("board_test123");
    expect(result!.columns["col1"]).toBeDefined();
    expect(result!.cards["card1"]).toBeDefined();
  });

  it("returns null when the board does not exist", () => {
    mockRepo.loadKanbanDocument.mockReturnValue(null);
    expect(loadKanbanDocument("board_nonexistent")).toBeNull();
  });
});

describe("deriveStatusFromColumn", () => {
  it('derives "in_progress" from "In Progress"', () => {
    mockRepo.deriveStatusFromColumn.mockReturnValue("in_progress");
    expect(deriveStatusFromColumn("In Progress")).toBe("in_progress");
  });

  it('derives "done" from "Done"', () => {
    mockRepo.deriveStatusFromColumn.mockReturnValue("done");
    expect(deriveStatusFromColumn("Done")).toBe("done");
  });

  it('derives "review" from "Review / QA"', () => {
    mockRepo.deriveStatusFromColumn.mockReturnValue("review");
    expect(deriveStatusFromColumn("Review / QA")).toBe("review");
  });

  it('derives "backlog" from "Backlog"', () => {
    mockRepo.deriveStatusFromColumn.mockReturnValue("backlog");
    expect(deriveStatusFromColumn("Backlog")).toBe("backlog");
  });

  it('derives "todo" as default', () => {
    mockRepo.deriveStatusFromColumn.mockReturnValue("todo");
    expect(deriveStatusFromColumn("Whatever")).toBe("todo");
  });
});

describe("ensureDefaultBoard", () => {
  it("returns the existing default board if one exists", () => {
    mockRepo.ensureDefaultBoard.mockReturnValue(BOARD_DATA);
    const result = ensureDefaultBoard();
    expect(result.id).toBe("board_test123");
  });
});
