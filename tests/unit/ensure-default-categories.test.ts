/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */

import { join } from "path";

const repoRoot = join(__dirname, "..", "..");

function loadRealBetterSqlite3(): typeof import("better-sqlite3") {
  return require("better-sqlite3/lib/index.js") as typeof import("better-sqlite3");
}

describe("ensureDefaultCategories", () => {
  it("seeds general and engineering when table is empty", () => {
    const Database = loadRealBetterSqlite3();
    const db = new (Database as unknown as new (
      path: string,
    ) => import("better-sqlite3").Database)(":memory:");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE mission_categories (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        color       TEXT NOT NULL DEFAULT 'cyan',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_system   INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.prepare("DELETE FROM mission_categories").run();
    expect(
      (
        db.prepare("SELECT COUNT(*) AS c FROM mission_categories").get() as {
          c: number;
        }
      ).c,
    ).toBe(0);

    db.exec(`
      INSERT OR IGNORE INTO mission_categories (id, name, color, sort_order, is_system)
      VALUES
        ('general', 'General', 'cyan', 0, 1),
        ('engineering', 'Engineering', 'purple', 1, 1);
    `);

    const count = (
      db.prepare("SELECT COUNT(*) AS c FROM mission_categories").get() as {
        c: number;
      }
    ).c;
    expect(count).toBe(2);
    db.close();
  });
});
