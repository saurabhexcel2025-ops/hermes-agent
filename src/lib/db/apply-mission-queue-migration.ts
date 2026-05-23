import type Database from "better-sqlite3";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const SCHEMA_VERSION_KEY = "schema_version";
export const MISSION_QUEUE_SCHEMA_VERSION = 5;

function getSchemaVersion(database: Database.Database): number {
  try {
    const row = database
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(SCHEMA_VERSION_KEY) as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(database: Database.Database, version: number): void {
  database
    .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)")
    .run(SCHEMA_VERSION_KEY, String(version));
}

function columnExists(database: Database.Database, table: string, column: string): boolean {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

/**
 * Apply 004_mission_queue.sql when schema_version is below 5.
 */
export function applyMissionQueueMigration(
  database: Database.Database,
  migrationsDir: string,
): number {
  const current = getSchemaVersion(database);
  if (current >= MISSION_QUEUE_SCHEMA_VERSION) {
    return current;
  }

  if (!columnExists(database, "missions", "queued_for_run")) {
    const path = join(migrationsDir, "004_mission_queue.sql");
    if (existsSync(path)) {
      const sql = readFileSync(path, "utf-8");
      try {
        database.exec(sql);
      } catch {
        // Idempotent on partial applies.
      }
    }
  }

  setSchemaVersion(database, MISSION_QUEUE_SCHEMA_VERSION);
  return MISSION_QUEUE_SCHEMA_VERSION;
}
