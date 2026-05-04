import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════
// /api/kanban — Kanban Board CRUD
// ═══════════════════════════════════════════════════════════════

import { requireMcApiKey, requireNotReadOnly } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { appendAuditLine } from "@/lib/audit-log";
import {
  ensureKanbanDir,
  listBoards,
  saveBoard,
  deleteBoard,
  loadKanbanDocument,
  saveKanbanDocument,
  newId,
} from "@/lib/kanban-repository";
import { loadTeam, saveTeam } from "@/lib/teams-repository";
import type {
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  AccentColor,
} from "@/types/hermes";

// ── GET ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  // Support both ?id= and ?boardId= for board lookups
  const boardId = url.searchParams.get("id") ?? url.searchParams.get("boardId");

  try {
    ensureKanbanDir();

    if (boardId) {
      const doc = loadKanbanDocument(boardId);
      if (!doc) {
        return NextResponse.json({ error: "Board not found" }, { status: 404 });
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

    // ── Create Board ────────────────────────────────────────────
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

      const now = new Date().toISOString();
      const boardId = newId("board");

      // Default columns
      const defaultColumns: Array<{
        title: string;
        color: AccentColor;
        position: number;
        wipLimit: number | null;
      }> = [
        { title: "Backlog", color: "cyan", position: 0, wipLimit: null },
        { title: "To Do", color: "orange", position: 1, wipLimit: null },
        { title: "In Progress", color: "purple", position: 2, wipLimit: null },
        { title: "Review", color: "pink", position: 3, wipLimit: null },
        { title: "Done", color: "green", position: 4, wipLimit: null },
      ];

      const columnDefs = columns && columns.length > 0 ? columns : defaultColumns;

      const colMap: Record<string, KanbanColumn> = {};
      const columnIds: string[] = [];

      for (const def of columnDefs) {
        const colId = newId("col");
        columnIds.push(colId);
        colMap[colId] = {
          id: colId,
          title: def.title,
          color: def.color ?? "cyan",
          position: def.position ?? 0,
          wipLimit: def.wipLimit ?? null,
          cardIds: [],
        };
      }

      const board: KanbanBoard = {
        id: boardId,
        name: name.trim(),
        description: (description ?? "").trim(),
        columnIds,
        teamId: (teamId ?? "").trim(),
        createdAt: now,
        updatedAt: now,
      };

      const doc = { board, columns: colMap, cards: {} as Record<string, KanbanCard> };
      saveKanbanDocument(doc);

      appendAuditLine({ action: "kanban.board.create", resource: boardId, ok: true });
      return NextResponse.json({ data: doc }, { status: 201 });
    }

    // ── Update Board ────────────────────────────────────────────
    if (action === "update-board") {
      const { boardId, name, description, teamId } = body as {
        boardId?: string;
        name?: string;
        description?: string;
        teamId?: string;
      };

      if (!boardId) return NextResponse.json({ error: "boardId is required" }, { status: 400 });

      const doc = loadKanbanDocument(boardId);
      if (!doc) return NextResponse.json({ error: "Board not found" }, { status: 404 });

      if (name !== undefined) doc.board.name = name.trim();
      if (description !== undefined) doc.board.description = description.trim();

      // Handle team assignment bidirectionally
      if (teamId !== undefined) {
        const newTeamId = teamId.trim();
        const oldTeamId = doc.board.teamId;

        if (newTeamId !== oldTeamId) {
          // Remove board from old team's boardIds
          if (oldTeamId) {
            const oldTeam = loadTeam(oldTeamId);
            if (oldTeam) {
              oldTeam.boardIds = oldTeam.boardIds.filter((id) => id !== boardId);
              saveTeam(oldTeam);
            }
          }

          // Add board to new team's boardIds
          if (newTeamId) {
            const newTeam = loadTeam(newTeamId);
            if (newTeam) {
              if (!newTeam.boardIds.includes(boardId)) {
                newTeam.boardIds.push(boardId);
                saveTeam(newTeam);
              }
            }
          }

          doc.board.teamId = newTeamId;
        }
      }

      doc.board.updatedAt = new Date().toISOString();

      saveBoard(doc.board);
      appendAuditLine({ action: "kanban.board.update", resource: boardId, ok: true });
      return NextResponse.json({ data: doc });
    }

    // ── Delete Board ───────────────────────────────────────────
    if (action === "delete-board") {
      const { boardId } = body as { boardId?: string };
      if (!boardId) return NextResponse.json({ error: "boardId is required" }, { status: 400 });

      const ok = deleteBoard(boardId);
      if (!ok) return NextResponse.json({ error: "Board not found" }, { status: 404 });

      appendAuditLine({ action: "kanban.board.delete", resource: boardId, ok: true });
      return NextResponse.json({ data: { deleted: boardId } });
    }

    // ── Add / Update / Delete Column ────────────────────────────
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

      const doc = loadKanbanDocument(boardId);
      if (!doc) return NextResponse.json({ error: "Board not found" }, { status: 404 });

      const colId = newId("col");
      const position = doc.board.columnIds.length;
      doc.board.columnIds.push(colId);
      doc.columns[colId] = {
        id: colId,
        title: title.trim(),
        color: color ?? "cyan",
        position,
        wipLimit: wipLimit ?? null,
        cardIds: [],
      };
      doc.board.updatedAt = new Date().toISOString();

      saveKanbanDocument(doc);
      appendAuditLine({ action: "kanban.column.add", resource: colId, ok: true });
      return NextResponse.json({ data: doc }, { status: 201 });
    }

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

      const doc = loadKanbanDocument(boardId);
      if (!doc) return NextResponse.json({ error: "Board not found" }, { status: 404 });
      if (!doc.columns[columnId]) {
        return NextResponse.json({ error: "Column not found" }, { status: 404 });
      }

      const col = doc.columns[columnId];
      if (title !== undefined) col.title = title.trim();
      if (color !== undefined) col.color = color;
      if (wipLimit !== undefined) col.wipLimit = wipLimit;
      doc.board.updatedAt = new Date().toISOString();

      saveKanbanDocument(doc);
      appendAuditLine({ action: "kanban.column.update", resource: columnId, ok: true });
      return NextResponse.json({ data: doc });
    }

    if (action === "delete-column") {
      const { boardId, columnId } = body as { boardId?: string; columnId?: string };

      if (!boardId || !columnId) {
        return NextResponse.json({ error: "boardId and columnId are required" }, { status: 400 });
      }

      const doc = loadKanbanDocument(boardId);
      if (!doc) return NextResponse.json({ error: "Board not found" }, { status: 404 });

      // Remove cards in this column
      const col = doc.columns[columnId];
      if (col) {
        for (const cardId of col.cardIds) {
          delete doc.cards[cardId];
        }
      }

      delete doc.columns[columnId];
      doc.board.columnIds = doc.board.columnIds.filter((id) => id !== columnId);
      doc.board.updatedAt = new Date().toISOString();

      saveKanbanDocument(doc);
      appendAuditLine({ action: "kanban.column.delete", resource: columnId, ok: true });
      return NextResponse.json({ data: doc });
    }

    // ── Add / Update / Delete Card ───────────────────────────────
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
        return NextResponse.json(
          { error: "boardId, columnId and title are required" },
          { status: 400 }
        );
      }

      const doc = loadKanbanDocument(boardId);
      if (!doc) return NextResponse.json({ error: "Board not found" }, { status: 404 });
      if (!doc.columns[columnId]) {
        return NextResponse.json({ error: "Column not found" }, { status: 404 });
      }

      const now = new Date().toISOString();
      const cardId = newId("card");
      const position = doc.columns[columnId].cardIds.length;

      const card: KanbanCard = {
        id: cardId,
        title: title.trim(),
        description: (description ?? "").trim(),
        columnId,
        boardId,
        position,
        status: "todo",
        assigneeProfileId: assigneeProfileId ?? null,
        goalIndices: [],
        missionIds: [],
        labels: labels ?? [],
        createdAt: now,
        updatedAt: now,
      };

      doc.columns[columnId].cardIds.push(cardId);
      doc.cards[cardId] = card;
      doc.board.updatedAt = now;

      saveKanbanDocument(doc);
      appendAuditLine({ action: "kanban.card.add", resource: cardId, ok: true });
      return NextResponse.json({ data: { card, board: doc } }, { status: 201 });
    }

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

      const doc = loadKanbanDocument(boardId);
      if (!doc) return NextResponse.json({ error: "Board not found" }, { status: 404 });
      if (!doc.cards[cardId]) {
        return NextResponse.json({ error: "Card not found" }, { status: 404 });
      }

      const card = doc.cards[cardId];
      if (title !== undefined) card.title = title.trim();
      if (description !== undefined) card.description = description.trim();
      if (assigneeProfileId !== undefined) card.assigneeProfileId = assigneeProfileId;
      if (labels !== undefined) card.labels = labels;
      if (status !== undefined) card.status = status;
      card.updatedAt = new Date().toISOString();
      doc.board.updatedAt = card.updatedAt;

      saveKanbanDocument(doc);
      appendAuditLine({ action: "kanban.card.update", resource: cardId, ok: true });
      return NextResponse.json({ data: { card, board: doc } });
    }

    if (action === "move-card") {
      const { boardId, cardId, toColumnId, toPosition } = body as {
        boardId?: string;
        cardId?: string;
        toColumnId?: string;
        toPosition?: number;
      };

      if (!boardId || !cardId || !toColumnId) {
        return NextResponse.json(
          { error: "boardId, cardId and toColumnId are required" },
          { status: 400 }
        );
      }

      const doc = loadKanbanDocument(boardId);
      if (!doc) return NextResponse.json({ error: "Board not found" }, { status: 404 });
      if (!doc.cards[cardId]) {
        return NextResponse.json({ error: "Card not found" }, { status: 404 });
      }
      if (!doc.columns[toColumnId]) {
        return NextResponse.json({ error: "Target column not found" }, { status: 404 });
      }

      const card = doc.cards[cardId];
      const fromColumnId = card.columnId;

      // Remove from source column
      if (doc.columns[fromColumnId]) {
        doc.columns[fromColumnId].cardIds = doc.columns[fromColumnId].cardIds.filter(
          (id) => id !== cardId
        );
      }

      // Insert into target column at position
      const targetCards = doc.columns[toColumnId].cardIds.filter((id) => id !== cardId);
      const insertAt = toPosition !== undefined
        ? Math.min(toPosition, targetCards.length)
        : targetCards.length;
      targetCards.splice(insertAt, 0, cardId);
      doc.columns[toColumnId].cardIds = targetCards;

      card.columnId = toColumnId;
      card.position = insertAt;
      card.updatedAt = new Date().toISOString();
      doc.board.updatedAt = card.updatedAt;

      saveKanbanDocument(doc);
      appendAuditLine({ action: "kanban.card.move", resource: cardId, ok: true });
      return NextResponse.json({ data: doc });
    }

    if (action === "delete-card") {
      const { boardId, cardId } = body as { boardId?: string; cardId?: string };

      if (!boardId || !cardId) {
        return NextResponse.json({ error: "boardId and cardId are required" }, { status: 400 });
      }

      const doc = loadKanbanDocument(boardId);
      if (!doc) return NextResponse.json({ error: "Board not found" }, { status: 404 });

      const card = doc.cards[cardId];
      if (card) {
        // Remove from column
        const col = doc.columns[card.columnId];
        if (col) {
          col.cardIds = col.cardIds.filter((id) => id !== cardId);
        }
        delete doc.cards[cardId];
      }

      doc.board.updatedAt = new Date().toISOString();
      saveKanbanDocument(doc);
      appendAuditLine({ action: "kanban.card.delete", resource: cardId, ok: true });
      return NextResponse.json({ data: doc });
    }

    // Unknown action
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    logApiError("POST /api/kanban", "processing request", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
