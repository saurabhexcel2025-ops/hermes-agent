/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */

import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..", "..");
const migrationsDir = join(repoRoot, "src", "lib", "db", "migrations");

function loadRealBetterSqlite3(): typeof import("better-sqlite3") {
  return require("better-sqlite3/lib/index.js") as typeof import("better-sqlite3");
}

describe("incremental migrations", () => {
  it("applies 002 when schema_version is 1", () => {
    const Database = loadRealBetterSqlite3();
    const db = new (Database as unknown as new (
      path: string,
    ) => import("better-sqlite3").Database)(":memory:");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('schema_version', '1');
      CREATE TABLE missions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        profile_id TEXT,
        status TEXT NOT NULL,
        result TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        local_dirs TEXT DEFAULT '[]',
        references_ TEXT DEFAULT '[]',
        skills TEXT DEFAULT '[]',
        goals TEXT DEFAULT '[]',
        model_id TEXT,
        provider TEXT,
        profile_name TEXT,
        mission_time_minutes INTEGER,
        timeout_minutes INTEGER,
        schedule TEXT,
        cron_job_id TEXT
      );
    `);

    const sql002 = readFileSync(
      join(migrationsDir, "002_mission_categories.sql"),
      "utf-8",
    );
    db.exec(sql002);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '2')").run();

    const version = db
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(parseInt(version.value, 10)).toBe(2);

    const catTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='mission_categories'",
      )
      .get();
    expect(catTable).toBeTruthy();

    const missionCols = db
      .prepare("PRAGMA table_info(missions)")
      .all() as Array<{ name: string }>;
    expect(missionCols.some((c) => c.name === "category_id")).toBe(true);
  });
});
