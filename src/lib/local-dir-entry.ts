// ═══════════════════════════════════════════════════════════════
// local-dir-entry — Normalise mission / template working directories
// ═══════════════════════════════════════════════════════════════

import type { LocalDirEntry } from "@/types/hermes";

/**
 * Coerce JSON / API payloads to `LocalDirEntry[]`.
 * Accepts legacy `string[]` or `{ path, branch? }[]`.
 */
export function normalizeLocalDirsInput(raw: unknown): LocalDirEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LocalDirEntry[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const p = item.trim();
      if (p) out.push({ path: p, branch: null });
      continue;
    }
    if (item && typeof item === "object" && "path" in item) {
      const rec = item as { path: unknown; branch?: unknown };
      if (typeof rec.path !== "string") continue;
      const p = rec.path.trim();
      if (!p) continue;
      let branch: string | null = null;
      if (rec.branch !== undefined && rec.branch !== null && rec.branch !== "") {
        branch = String(rec.branch).trim() || null;
      }
      out.push({ path: p, branch });
    }
  }
  return out;
}

/** One bullet line (+ optional branch hint) for Working Directories section. */
export function formatLocalDirEntryLine(e: LocalDirEntry): string {
  const b = e.branch && String(e.branch).trim();
  if (b) {
    return `  - ${e.path}\n    Use git branch: ${b}`;
  }
  return `  - ${e.path}`;
}
