import type Database from "better-sqlite3";

function tableExists(database: Database.Database, name: string): boolean {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { name: string } | undefined;
  return Boolean(row);
}

function columnExists(
  database: Database.Database,
  tableName: string,
  columnName: string,
): boolean {
  if (!tableExists(database, tableName)) return false;
  const columns = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

/** Idempotent v2 -> v3 parity fixes after SQL migrations. */
export function ensureProfilesToolsParity(database: Database.Database): void {
  if (tableExists(database, "tool_plugins")) {
    database.exec("DROP TABLE IF EXISTS tool_plugins");
  }

  if (tableExists(database, "agent_profiles")) {
    if (!columnExists(database, "agent_profiles", "user_md")) {
      database.exec("ALTER TABLE agent_profiles ADD COLUMN user_md TEXT NOT NULL DEFAULT ''");
    }
    if (!columnExists(database, "agent_profiles", "memory_md")) {
      database.exec("ALTER TABLE agent_profiles ADD COLUMN memory_md TEXT NOT NULL DEFAULT ''");
    }
    if (!columnExists(database, "agent_profiles", "disabled_skills")) {
      database.exec(
        "ALTER TABLE agent_profiles ADD COLUMN disabled_skills TEXT NOT NULL DEFAULT '[]'",
      );
    }
    if (!columnExists(database, "agent_profiles", "platform_toolsets")) {
      database.exec(
        "ALTER TABLE agent_profiles ADD COLUMN platform_toolsets TEXT NOT NULL DEFAULT '{}'",
      );
    }
  }

  if (
    tableExists(database, "agent_root") &&
    !columnExists(database, "agent_root", "disabled_skills")
  ) {
    database.exec("ALTER TABLE agent_root ADD COLUMN disabled_skills TEXT NOT NULL DEFAULT '[]'");
  }
  if (
    tableExists(database, "agent_root") &&
    !columnExists(database, "agent_root", "platform_toolsets")
  ) {
    database.exec(
      "ALTER TABLE agent_root ADD COLUMN platform_toolsets TEXT NOT NULL DEFAULT '{}'",
    );
  }

  if (
    tableExists(database, "missions") &&
    !columnExists(database, "missions", "suggested_toolsets")
  ) {
    database.exec(
      "ALTER TABLE missions ADD COLUMN suggested_toolsets TEXT NOT NULL DEFAULT '[]'",
    );
  }

  if (
    tableExists(database, "catalog_templates") &&
    !columnExists(database, "catalog_templates", "suggested_toolsets")
  ) {
    database.exec(
      "ALTER TABLE catalog_templates ADD COLUMN suggested_toolsets TEXT NOT NULL DEFAULT '[]'",
    );
  }
}
