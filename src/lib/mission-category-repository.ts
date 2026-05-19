// ═══════════════════════════════════════════════════════════════
// mission-category-repository.ts — User-managed mission categories
// ═══════════════════════════════════════════════════════════════

import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";

import { db, inTransaction, now } from "./db";
import { PATHS } from "./paths";

export interface MissionCategory {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_system: number;
  created_at: string;
  updated_at: string;
}

const ALLOWED_COLORS = new Set([
  "cyan",
  "purple",
  "pink",
  "green",
  "orange",
  "blue",
  "red",
]);

function rowToCategory(row: CategoryRow): MissionCategory {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function slugifyCategoryName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "category";
}

function uniqueCategoryId(baseSlug: string): string {
  let candidate = baseSlug;
  let n = 2;
  while (getCategory(candidate)) {
    candidate = `${baseSlug}-${n}`;
    n += 1;
  }
  return candidate;
}

export function listCategories(): MissionCategory[] {
  const rows = db()
    .prepare(
      "SELECT * FROM mission_categories ORDER BY sort_order ASC, lower(name) ASC",
    )
    .all() as CategoryRow[];
  return rows.map(rowToCategory);
}

export function getCategory(id: string): MissionCategory | null {
  const row = db()
    .prepare("SELECT * FROM mission_categories WHERE id = ?")
    .get(id) as CategoryRow | undefined;
  return row ? rowToCategory(row) : null;
}

export function getCategoryByName(name: string): MissionCategory | null {
  const row = db()
    .prepare("SELECT * FROM mission_categories WHERE lower(name) = lower(?)")
    .get(name.trim()) as CategoryRow | undefined;
  return row ? rowToCategory(row) : null;
}

export function countMissionsInCategory(categoryId: string): number {
  const row = db()
    .prepare(
      "SELECT COUNT(*) AS c FROM missions WHERE deleted_at IS NULL AND category_id = ?",
    )
    .get(categoryId) as { c: number };
  return row.c ?? 0;
}

export function countTemplatesInCategory(categoryId: string): number {
  const dir = PATHS.templates;
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(
        readFileSync(dir + "/" + file, "utf-8"),
      ) as Record<string, unknown>;
      const cid = raw.categoryId ?? raw.category_id;
      if (typeof cid === "string" && cid === categoryId) {
        count += 1;
        continue;
      }
      const legacy = raw.category;
      if (
        typeof legacy === "string" &&
        slugifyCategoryName(legacy) === categoryId
      ) {
        count += 1;
      }
    } catch {
      // skip invalid files
    }
  }
  return count;
}

export function createCategory(data: {
  name: string;
  color?: string;
}): MissionCategory {
  const name = data.name.trim();
  if (!name) {
    throw new Error("Category name is required");
  }
  const existing = getCategoryByName(name);
  if (existing) {
    throw new Error("Category name already exists");
  }
  const color =
    data.color && ALLOWED_COLORS.has(data.color) ? data.color : "cyan";
  const id = uniqueCategoryId(slugifyCategoryName(name));
  const ts = now();
  const maxOrder = db()
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM mission_categories")
    .get() as { m: number };
  const sortOrder = (maxOrder.m ?? -1) + 1;

  db()
    .prepare(
      `INSERT INTO mission_categories (id, name, color, sort_order, is_system, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(id, name, color, sortOrder, ts, ts);

  return getCategory(id)!;
}

export function updateCategory(
  id: string,
  updates: { name?: string; color?: string; sortOrder?: number },
): MissionCategory | null {
  const existing = getCategory(id);
  if (!existing) return null;

  const sets: string[] = ["updated_at = ?"];
  const vals: unknown[] = [now()];

  if (updates.name !== undefined) {
    const name = updates.name.trim();
    if (!name) throw new Error("Category name is required");
    const dup = getCategoryByName(name);
    if (dup && dup.id !== id) {
      throw new Error("Category name already exists");
    }
    sets.push("name = ?");
    vals.push(name);
  }
  if (updates.color !== undefined) {
    const color = ALLOWED_COLORS.has(updates.color) ? updates.color : existing.color;
    sets.push("color = ?");
    vals.push(color);
  }
  if (updates.sortOrder !== undefined) {
    sets.push("sort_order = ?");
    vals.push(updates.sortOrder);
  }

  vals.push(id);
  db()
    .prepare(`UPDATE mission_categories SET ${sets.join(", ")} WHERE id = ?`)
    .run(...vals);

  return getCategory(id);
}

export function reassignMissionsCategory(
  fromId: string,
  toId: string | null,
): void {
  db()
    .prepare(
      "UPDATE missions SET category_id = ?, updated_at = ? WHERE category_id = ? AND deleted_at IS NULL",
    )
    .run(toId, now(), fromId);
}

export function reassignTemplatesCategory(
  fromId: string,
  toId: string | null,
): void {
  const dir = PATHS.templates;
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = dir + "/" + file;
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<
        string,
        unknown
      >;
      const cid = raw.categoryId ?? raw.category_id;
      const legacy =
        typeof raw.category === "string"
          ? slugifyCategoryName(raw.category)
          : "";
      if (cid === fromId || legacy === fromId) {
        raw.categoryId = toId;
        delete raw.category;
        writeFileSync(path, JSON.stringify(raw, null, 2), "utf-8");
      }
    } catch {
      // skip
    }
  }
}

export function deleteCategory(
  id: string,
  reassignToId?: string | null,
): boolean {
  const existing = getCategory(id);
  if (!existing) return false;
  if (existing.isSystem) {
    throw new Error("System categories cannot be deleted");
  }

  const missionCount = countMissionsInCategory(id);
  const templateCount = countTemplatesInCategory(id);
  if (missionCount > 0 || templateCount > 0) {
    if (reassignToId === undefined) {
      throw new Error("reassignToId required when category is in use");
    }
    if (reassignToId !== null && !getCategory(reassignToId)) {
      throw new Error("Reassign target category not found");
    }
    inTransaction(() => {
      reassignMissionsCategory(id, reassignToId);
      reassignTemplatesCategory(id, reassignToId);
    });
  }

  db().prepare("DELETE FROM mission_categories WHERE id = ?").run(id);
  return true;
}

/** Map legacy template category string to system category id. */
export function resolveTemplateCategoryId(
  category?: string,
  categoryId?: string,
): string | undefined {
  if (categoryId && getCategory(categoryId)) {
    return categoryId;
  }
  if (!category) return undefined;
  const slug = slugifyCategoryName(category);
  if (getCategory(slug)) return slug;
  if (slug === "general" || category === "General") return "general";
  if (slug === "engineering" || category === "Engineering") return "engineering";
  return undefined;
}

export function ensureDefaultCategories(): void {
  try {
    listCategories();
  } catch {
    // table may not exist yet
  }
}
