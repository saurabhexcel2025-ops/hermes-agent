// ═══════════════════════════════════════════════════════════════
// KanbanRepository — Kanban board JSON under control-hub/data/kanban
// ═══════════════════════════════════════════════════════════════

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";

import { PATHS } from "@/lib/hermes";
import { logApiError } from "@/lib/api-logger";
import type {
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  KanbanDocument,
} from "@/types/hermes";

const DATA_DIR = PATHS.kanban;

// ── Internal JSON helpers ─────────────────────────────────────

function readJsonFile<T>(path: string, route: string, context: string): T | null {
  try {
    const text = readFileSync(path, "utf-8");
    return JSON.parse(text) as T;
  } catch (error) {
    logApiError(route, `parsing JSON ${context}`, error);
    return null;
  }
}

// ── ID Sanitisation ────────────────────────────────────────────

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

// ── Directory Guarantee ────────────────────────────────────────

export function ensureKanbanDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ── Board ─────────────────────────────────────────────────────

export function getKanbanDataDir(): string {
  return DATA_DIR;
}

function boardPath(id: string): string {
  return DATA_DIR + "/" + sanitizeId(id) + ".board.json";
}

export function loadBoard(id: string): KanbanBoard | null {
  const safe = sanitizeId(id);
  if (!safe) return null;
  const path = boardPath(safe);
  if (!existsSync(path)) return null;
  return readJsonFile<KanbanBoard>(path, "loadBoard", "board") ?? null;
}

export function saveBoard(board: KanbanBoard): void {
  ensureKanbanDir();
  const safe = sanitizeId(board.id);
  if (!safe) return;
  writeFileSync(boardPath(safe), JSON.stringify(board, null, 2));
}

export function deleteBoard(id: string): boolean {
  const safe = sanitizeId(id);
  if (!safe) return false;
  const path = boardPath(safe);
  if (!existsSync(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

export function listBoards(): KanbanBoard[] {
  ensureKanbanDir();
  try {
    const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".board.json"));
    const boards: KanbanBoard[] = [];
    for (const file of files) {
      const board = readJsonFile<KanbanBoard>(DATA_DIR + "/" + file, "listBoards", file);
      if (board) boards.push(board);
    }
    return boards.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

// ── Column ────────────────────────────────────────────────────

function columnPath(boardId: string): string {
  return DATA_DIR + "/" + sanitizeId(boardId) + ".columns.json";
}

export function loadColumns(boardId: string): Record<string, KanbanColumn> {
  const path = columnPath(boardId);
  if (!existsSync(path)) return {};
  return readJsonFile<Record<string, KanbanColumn>>(path, "loadColumns", boardId) ?? {};
}

export function saveColumns(boardId: string, columns: Record<string, KanbanColumn>): void {
  ensureKanbanDir();
  writeFileSync(columnPath(boardId), JSON.stringify(columns, null, 2));
}

// ── Card ──────────────────────────────────────────────────────

function cardPath(boardId: string): string {
  return DATA_DIR + "/" + sanitizeId(boardId) + ".cards.json";
}

export function loadCards(boardId: string): Record<string, KanbanCard> {
  const path = cardPath(boardId);
  if (!existsSync(path)) return {};
  return readJsonFile<Record<string, KanbanCard>>(path, "loadCards", boardId) ?? {};
}

export function saveCards(boardId: string, cards: Record<string, KanbanCard>): void {
  ensureKanbanDir();
  writeFileSync(cardPath(boardId), JSON.stringify(cards, null, 2));
}

// ── Full Document Loader ───────────────────────────────────────

export function loadKanbanDocument(boardId: string): KanbanDocument | null {
  const board = loadBoard(boardId);
  if (!board) return null;
  return {
    board,
    columns: loadColumns(boardId),
    cards: loadCards(boardId),
  };
}

// ── Atomic Board Save (board + columns + cards together) ───────

export function saveKanbanDocument(doc: KanbanDocument): void {
  saveBoard(doc.board);
  saveColumns(doc.board.id, doc.columns);
  saveCards(doc.board.id, doc.cards);
}

// ── Generate IDs ──────────────────────────────────────────────

export function newId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return prefix + "_" + timestamp + randomPart;
}
