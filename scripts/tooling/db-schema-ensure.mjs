/**
 * Idempotent schema fixes after SQL migrations (v2 -> v3 parity).
 * Used when a DB partially applied an older migration chain.
 */

export function tableExists(database, name) {
  return Boolean(
    database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name),
  );
}

export function columnExists(database, tableName, columnName) {
  if (!tableExists(database, tableName)) return false;
  return database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

export function ensureProfilesToolsParity(database) {
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

  if (tableExists(database, "agent_root") && !columnExists(database, "agent_root", "disabled_skills")) {
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

  if (tableExists(database, "missions") && !columnExists(database, "missions", "suggested_toolsets")) {
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
