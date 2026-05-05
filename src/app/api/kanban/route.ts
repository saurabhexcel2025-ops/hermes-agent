// ═══════════════════════════════════════════════════════════════
// /api/kanban — Kanban Board CRUD (SQLite)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { requireMcApiKey, requireNotReadOnly } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { appendAuditLine } from "@/lib/audit-log";
import {
  listBoards,
  getBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  loadKanbanDocument,
  ensureDefaultBoard,
  // Column
  createColumn,
  updateColumn,
  deleteColumn,
  // Card
  createCard,
  updateCard,
  moveCard,
  deleteCard,
  getColumn,
  listColumns,
  listCards,
} from "@/lib/kanban-repository";
import type { AccentColor, KanbanBoard, KanbanCard } from "@/types/hermes";

// ── GET ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const boardId = url.searchParams.get("id") ?? url.searchParams.get("boardId");

  try {
    if (boardId) {
      const doc = loadKanbanDocument(boardId);
      if (!doc) {
        return NextResponse.json({ error: "Board not found" }, { status: 404 });
      }
      // Populate columnIds and cardIds
      doc.board.columnIds = Object.keys(doc.columns);
      for (const col of Object.values(doc.columns) as Array<{ id: string; title: string; cardIds?: string[] }>) {
        col.cardIds = listCards(boardId)
          .filter((c) => c.columnId === col.id)
          .map((c) => c.id);
      }
      return NextResponse.json({ data: doc });
    }

    const boards = listBoards();
    return NextResponse.json({ data: { boards } });
  } catch (error) {
    logApiError("GET /api/kanban", boardId ? `board ${boardId}` : "listing boards", error);
    return NextResponse.json({ error: "Failed to load kanban data" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ro = requireNotReadOnly();
  if (ro) return ro;
  const auth = requireMcApiKey(request);
  if (auth) return auth;

  try {
    const body = await request.json();
    const { action } = body as { action?: string };

    // ── Create Board ──────────────────────────────────────────
    if (action === "create-board") {
      const { name, description, teamId, columns } = body as {
        name?: string;
        description?: string;
        teamId?: string;
        columns?: Array<{ title: string; color?: AccentColor; position?: number; wipLimit?: number | null }>;
      };

      if (!name || typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Board name is required" }, { status: 400 });
      }

      const board = createBoard({
        name: name.trim(),
        description: (description ?? "").trim(),
        teamId: teamId?.trim(),
      });

      // Default columns
      const defaultColumns = [
        { title: "Backlog", color: "cyan" as AccentColor, position: 0, wipLimit: null },
        { title: "To Do", color: "orange" as AccentColor, position: 1, wipLimit: null },
        { title: "In Progress", color: "purple" as AccentColor, position: 2, wipLimit: null },
        { title: "Review", color: "pink" as AccentColor, position: 3, wipLimit: null },
        { title: "Done", color: "green" as AccentColor, position: 4, wipLimit: null },
      ];

      const columnDefs = columns && columns.length > 0 ? columns : defaultColumns;
      const colMap: Record<string, unknown> = {};
      const columnIds: string[] = [];

      for (const def of columnDefs) {
        const col = createColumn({
          boardId: board.id,
          title: def.title,
          color: def.color ?? "cyan",
          position: def.position ?? 0,
          wipLimit: def.wipLimit ?? null,
        });
        columnIds.push(col.id);
        colMap[col.id] = col;
      }

      const doc = { board: { ...board, columnIds }, columns: colMap, cards: {} as Record<string, KanbanCard> };
      appendAuditLine({ action: "kanban.board.create", resource: board.id, ok: true });
      return NextResponse.json({ data: doc }, { status: 201 });
    }

    // ── Update Board ──────────────────────────────────────────
    if (action === "update-board") {
      const { boardId, name, description, teamId } = body as {
        boardId?: string;
        name?: string;
        description?: string;
        teamId?: string;
      };

      if (!boardId) return NextResponse.json({ error: "boardId is required" }, { status: 400 });

      const board = updateBoard(boardId, {
        name: name?.trim(),
        description: description?.trim(),
        teamId: teamId?.trim(),
      });
      if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

      const doc = loadKanbanDocument(boardId);
      appendAuditLine({ action: "kanban.board.update", resource: boardId, ok: true });
      return NextResponse.json({ data: doc ?? { board } });
    }

    // ── Delete Board ─────────────────────────────────────────
    if (action === "delete-board") {
      const { boardId } = body as { boardId?: string };
      if (!boardId) return NextResponse.json({ error: "boardId is required" }, { status: 400 });

      const ok = deleteBoard(boardId);
      if (!ok) return NextResponse.json({ error: "Board not found" }, { status: 404 });

      appendAuditLine({ action: "kanban.board.delete", resource: boardId, ok: true });
      return NextResponse.json({ data: { deleted: boardId } });
    }

    // ── Add Column ───────────────────────────────────────────
    if (action === "add-column") {
      const { boardId, title, color, wipLimit } = body as {
        boardId?: string;
        title?: string;
        color?: AccentColor;
        wipLimit?: number | null;
      };

      if (!boardId || !title) {
        return NextResponse.json({ error: "boardId and title are required" }, { status: 400 });
      }

      const board = getBoard(boardId);
      if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

      const existing = listColumns(boardId);
      const col = createColumn({
        boardId,
        title: title.trim(),
        color: color ?? "cyan",
        position: existing.length,
        wipLimit: wipLimit ?? null,
      });

      const doc = loadKanbanDocument(boardId);
      appendAuditLine({ action: "kanban.column.add", resource: col.id, ok: true });
      return NextResponse.json({ data: doc }, { status: 201 });
    }

    // ── Update Column ─────────────────────────────────────────
    if (action === "update-column") {
      const { boardId, columnId, title, color, wipLimit } = body as {
        boardId?: string;
        columnId?: string;
        title?: string;
        color?: AccentColor;
        wipLimit?: number | null;
      };

      if (!boardId || !columnId) {
        return NextResponse.json({ error: "boardId and columnId are required" }, { status: 400 });
      }

      const col = updateColumn(columnId, {
        title: title?.trim(),
        color,
        wipLimit,
      });
      if (!col) return NextResponse.json({ error: "Column not found" }, { status: 404 });

      const doc = loadKanbanDocument(boardId);
      appendAuditLine({ action: "kanban.column.update", resource: columnId, ok: true });
      return NextResponse.json({ data: doc });
    }

    // ── Delete Column ─────────────────────────────────────────
    if (action === "delete-column") {
      const { boardId, columnId } = body as { boardId?: string; columnId?: string };

      if (!boardId || !columnId) {
        return NextResponse.json({ error: "boardId and columnId are required" }, { status: 400 });
      }

      const ok = deleteColumn(columnId);
      if (!ok) return NextResponse.json({ error: "Column not found" }, { status: 404 });

      const doc = loadKanbanDocument(boardId);
      appendAuditLine({ action: "kanban.column.delete", resource: columnId, ok: true });
      return NextResponse.json({ data: doc ?? {} });
    }

    // ── Add Card ─────────────────────────────────────────────
    if (action === "add-card") {
      const { boardId, columnId, title, description, assigneeProfileId, labels } = body as {
        boardId?: string;
        columnId?: string;
        title?: string;
        description?: string;
        assigneeProfileId?: string | null;
        labels?: string[];
      };

      if (!boardId || !columnId || !title) {
        return NextResponse.json({ error: "boardId, columnId and title are required" }, { status: 400 });
      }

      const board = getBoard(boardId);
      if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

      const col = getColumn(columnId);
      if (!col) return NextResponse.json({ error: "Column not found" }, { status: 404 });

      const existingCards = listCards(boardId).filter((c) => c.columnId === columnId);
      const card = createCard({
        boardId,
        columnId,
        title: title.trim(),
        description: (description ?? "").trim(),
        assigneeProfileId: assigneeProfileId ?? null,
        labels: labels ?? [],
        position: existingCards.length,
        status: "todo",
      });

      const doc = loadKanbanDocument(boardId);
      appendAuditLine({ action: "kanban.card.add", resource: card.id, ok: true });
      return NextResponse.json({ data: { card, board: doc } }, { status: 201 });
    }

    // ── Update Card ───────────────────────────────────────────
    if (action === "update-card") {
      const { boardId, cardId, title, description, assigneeProfileId, labels, status } = body as {
        boardId?: string;
        cardId?: string;
        title?: string;
        description?: string;
        assigneeProfileId?: string | null;
        labels?: string[];
        status?: KanbanCard["status"];
      };

      if (!boardId || !cardId) {
        return NextResponse.json({ error: "boardId and cardId are required" }, { status: 400 });
      }

      const card = updateCard(cardId, {
        title: title?.trim(),
        description: description?.trim(),
        assigneeProfileId,
        labels,
        status,
      });
      if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

      const doc = loadKanbanDocument(boardId);
      appendAuditLine({ action: "kanban.card.update", resource: cardId, ok: true });
      return NextResponse.json({ data: { card, board: doc } });
    }

    // ── Move Card ─────────────────────────────────────────────
    if (action === "move-card") {
      const { boardId, cardId, toColumnId, toPosition } = body as {
        boardId?: string;
        cardId?: string;
        toColumnId?: string;
        toPosition?: number;
      };

      if (!boardId || !cardId || !toColumnId) {
        return NextResponse.json({ error: "boardId, cardId and toColumnId are required" }, { status: 400 });
      }

      const card = moveCard(cardId, toColumnId, toPosition ?? 0);
      if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

      const doc = loadKanbanDocument(boardId);
      appendAuditLine({ action: "kanban.card.move", resource: cardId, ok: true });
      return NextResponse.json({ data: doc });
    }

    // ── Delete Card ───────────────────────────────────────────
    if (action === "delete-card") {
      const { boardId, cardId } = body as { boardId?: string; cardId?: string };

      if (!boardId || !cardId) {
        return NextResponse.json({ error: "boardId and cardId are required" }, { status: 400 });
      }

      const ok = deleteCard(cardId);
      if (!ok) return NextResponse.json({ error: "Card not found" }, { status: 404 });

      const doc = loadKanbanDocument(boardId);
      appendAuditLine({ action: "kanban.card.delete", resource: cardId, ok: true });
      return NextResponse.json({ data: doc ?? {} });
    }

    // Unknown action
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    logApiError("POST /api/kanban", "processing request", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
