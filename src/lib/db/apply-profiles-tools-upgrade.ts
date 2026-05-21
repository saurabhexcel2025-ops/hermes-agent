import type Database from "better-sqlite3";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  ensureProfilesToolsParity,
  PROFILES_TOOLS_PARITY_SCHEMA_VERSION,
} from "./profiles-tools-parity-ensure";

const SCHEMA_VERSION_KEY = "schema_version";

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

/**
 * Apply 002_profiles_tools_parity.sql when meta schema_version is below 3.
 * File prefix 002 is a migration sequence id, not the target schema version.
 */
export function applyProfilesToolsParityUpgrade(
  database: Database.Database,
  migrationsDir: string,
): number {
  const current = getSchemaVersion(database);
  if (current >= PROFILES_TOOLS_PARITY_SCHEMA_VERSION) {
    ensureProfilesToolsParity(database);
    return current;
  }

  if (existsSync(migrationsDir)) {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const num = parseInt(file.split("_")[0], 10);
      if (isNaN(num) || num <= 1) continue;
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      try {
        database.exec(sql);
      } catch {
        // Partial v2 DBs may already have some ALTERs; idempotent ensure below.
      }
    }
  }

  ensureProfilesToolsParity(database);
  setSchemaVersion(database, PROFILES_TOOLS_PARITY_SCHEMA_VERSION);
  return PROFILES_TOOLS_PARITY_SCHEMA_VERSION;
}
