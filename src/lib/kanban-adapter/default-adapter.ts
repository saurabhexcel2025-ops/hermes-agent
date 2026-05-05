// ═══════════════════════════════════════════════════════════════════════════════
// kanban-adapter/default-adapter.ts — Default SQLite-backed adapter
//
// This is the default adapter for ~/control-hub. It wraps the existing
// kanban-repository.ts (which uses our own SQLite schema) and exposes it
// through the generic KanbanAdapter interface.
//
// To swap in a different backend (e.g. Hermes, a REST API, PI work queue):
//   import { HermesKanbanAdapter } from "./backends/hermes-kanban";
//   export function getKanbanAdapter(): KanbanAdapter {
//     return new HermesKanbanAdapter();
//   }
//
// For now this is the only adapter — all Control Hub kanban operations
// route through here, making a future swap completely frictionless.
// ═══════════════════════════════════════════════════════════════════════════════

import type { KanbanAdapter } from "./index";
import type {
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  KanbanDocument,
  CardMissionLink,
} from "./types";
import {
  listBoards as _listBoards,
  getBoard as _getBoard,
  createBoard as _createBoard,
  updateBoard as _updateBoard,
  deleteBoard as _deleteBoard,
  listColumns as _listColumns,
  getColumn as _getColumn,
  createColumn as _createColumn,
  updateColumn as _updateColumn,
  deleteColumn as _deleteColumn,
  listCards as _listCards,
  getCard as _getCard,
  createCard as _createCard,
  updateCard as _updateCard,
  moveCard as _moveCard,
  deleteCard as _deleteCard,
  loadKanbanDocument as _loadKanbanDocument,
  ensureDefaultBoard as _ensureDefaultBoard,
} from "@/lib/kanban-repository";

// ── Adapter ──────────────────────────────────────────────────────────────────

export class DefaultKanbanAdapter implements KanbanAdapter {
  readonly name = "sqlite";

  // ── Board ────────────────────────────────────────────────────────────────

  listBoards(): KanbanBoard[] {
    return _listBoards();
  }

  getBoard(id: string): KanbanBoard | null {
    return _getBoard(id);
  }

  createBoard(data: {
    name: string;
    description?: string;
    teamId?: string;
  }): KanbanBoard {
    return _createBoard(data);
  }

  updateBoard(
    id: string,
    updates: {
      name?: string;
      description?: string;
      teamId?: string;
    }
  ): KanbanBoard | null {
    return _updateBoard(id, updates);
  }

  deleteBoard(id: string): boolean {
    return _deleteBoard(id);
  }

  // ── Column ───────────────────────────────────────────────────────────────

  listColumns(boardId: string): KanbanColumn[] {
    return _listColumns(boardId);
  }

  getColumn(id: string): KanbanColumn | null {
    return _getColumn(id);
  }

  createColumn(data: {
    boardId: string;
    title: string;
    color?: string;
    position?: number;
    wipLimit?: number | null;
  }): KanbanColumn {
    return _createColumn(data);
  }

  updateColumn(
    id: string,
    updates: {
      title?: string;
      color?: string;
      position?: number;
      wipLimit?: number | null;
    }
  ): KanbanColumn | null {
    return _updateColumn(id, updates);
  }

  deleteColumn(id: string): boolean {
    return _deleteColumn(id);
  }

  // ── Card ─────────────────────────────────────────────────────────────────

  listCards(boardId: string): KanbanCard[] {
    return _listCards(boardId);
  }

  getCard(id: string): KanbanCard | null {
    return _getCard(id);
  }

  createCard(data: {
    boardId: string;
    columnId: string;
    title: string;
    description?: string;
    assigneeProfileId?: string | null;
    labels?: string[];
    status?: KanbanCard["status"];
    position?: number;
  }): KanbanCard {
    return _createCard(data);
  }

  updateCard(
    id: string,
    updates: {
      title?: string;
      description?: string;
      columnId?: string;
      position?: number;
      status?: KanbanCard["status"];
      assigneeProfileId?: string | null;
      labels?: string[];
      missionIds?: string[];
    }
  ): KanbanCard | null {
    return _updateCard(id, updates);
  }

  moveCard(
    cardId: string,
    toColumnId: string,
    toPosition: number
  ): KanbanCard | null {
    return _moveCard(cardId, toColumnId, toPosition);
  }

  deleteCard(id: string): boolean {
    return _deleteCard(id);
  }

  // ── Full document ────────────────────────────────────────────────────────

  loadKanbanDocument(boardId: string): KanbanDocument | null {
    return _loadKanbanDocument(boardId);
  }

  // ── Mission linkage ──────────────────────────────────────────────────────
  // Card ↔ mission linkage is stored in the card's mission_ids JSON column.

  linkCardToMission(cardId: string, missionId: string): CardMissionLink {
    const card = _getCard(cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);
    const ids: string[] = card.missionIds.includes(missionId)
      ? card.missionIds
      : [...card.missionIds, missionId];
    _updateCard(cardId, { missionIds: ids });
    return {
      id: `${cardId}:${missionId}`,
      cardId,
      missionId,
      createdAt: new Date().toISOString(),
    };
  }

  listMissionLinks(cardId: string): CardMissionLink[] {
    const card = _getCard(cardId);
    if (!card) return [];
    return card.missionIds.map((mid) => ({
      id: `${cardId}:${mid}`,
      cardId,
      missionId: mid,
      createdAt: new Date().toISOString(),
    }));
  }

  // ── Default board ────────────────────────────────────────────────────────

  ensureDefaultBoard(): KanbanBoard {
    return _ensureDefaultBoard();
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

let _adapter: KanbanAdapter | null = null;

export function getKanbanAdapter(): KanbanAdapter {
  if (!_adapter) {
    _adapter = new DefaultKanbanAdapter();
  }
  return _adapter;
}
