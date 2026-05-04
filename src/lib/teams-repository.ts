// ═══════════════════════════════════════════════════════════════
// TeamsRepository — Team JSON under control-hub/data/teams
// ═══════════════════════════════════════════════════════════════

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";

import { PATHS } from "@/lib/hermes";
import { logApiError } from "@/lib/api-logger";
import type { Team } from "@/types/hermes";

const DATA_DIR = PATHS.workspaces + "/teams";

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

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function ensureTeamsDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function teamPath(id: string): string {
  return DATA_DIR + "/" + sanitizeId(id) + ".team.json";
}

export function getTeamsDataDir(): string {
  return DATA_DIR;
}

export function loadTeam(id: string): Team | null {
  const safe = sanitizeId(id);
  if (!safe) return null;
  return readJsonFile<Team>(teamPath(safe), "loadTeam", "team") ?? null;
}

export function saveTeam(team: Team): void {
  ensureTeamsDir();
  const safe = sanitizeId(team.id);
  if (!safe) return;
  writeFileSync(teamPath(safe), JSON.stringify(team, null, 2));
}

export function deleteTeam(id: string): boolean {
  const safe = sanitizeId(id);
  if (!safe) return false;
  const path = teamPath(safe);
  if (!existsSync(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

export function listTeams(): Team[] {
  ensureTeamsDir();
  try {
    const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".team.json"));
    const teams: Team[] = [];
    for (const file of files) {
      const team = readJsonFile<Team>(DATA_DIR + "/" + file, "listTeams", file);
      if (team) teams.push(team);
    }
    return teams.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function newId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return prefix + "_" + timestamp + randomPart;
}
