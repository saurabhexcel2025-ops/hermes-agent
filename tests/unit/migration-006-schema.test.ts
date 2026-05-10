/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */

/**
 * Schema-level test for migration 006_models_credentials.sql.
 *
 * Bypasses the global better-sqlite3 mock (jest.config.js moduleNameMapper)
 * by resolving the real native module via require.resolve so we can run
 * actual SQL against an in-memory database.
 */

import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..", "..");
const migrationPath = join(repoRoot, "src", "lib", "db", "migrations", "006_models_credentials.sql");
const initialPath = join(repoRoot, "src", "lib", "db", "migrations", "001_initial_schema.sql");
const missionExtPath = join(repoRoot, "src", "lib", "db", "migrations", "004_mission_extensions.sql");
const statusEnumPath = join(repoRoot, "src", "lib", "db", "migrations", "005_mission_status_enum.sql");

function loadRealBetterSqlite3(): typeof import("better-sqlite3") {
  // moduleNameMapper in jest.config.js anchors on `^better-sqlite3$`, so
  // pointing at the package's index file directly skips the mock and loads
  // the real native binding.
  return require("better-sqlite3/lib/index.js") as typeof import("better-sqlite3");
}

function freshDb(): import("better-sqlite3").Database {
  const Database = loadRealBetterSqlite3();
  // eslint-disable-next-line new-cap
  const db = new (Database as unknown as new (path: string) => import("better-sqlite3").Database)(
    ":memory:"
  );
  db.pragma("foreign_keys = ON");
  // Bring the schema up to migration 005 so 006 has all expected dependencies.
  db.exec(readFileSync(initialPath, "utf-8"));
  db.exec(readFileSync(missionExtPath, "utf-8"));
  db.exec(readFileSync(statusEnumPath, "utf-8"));
  db.exec(readFileSync(migrationPath, "utf-8"));
  return db;
}

describe("Migration 006 — credentials table shape", () => {
  it("creates the expected columns", () => {
    const db = freshDb();
    const cols = db
      .prepare("PRAGMA table_info(credentials)")
      .all() as Array<{ name: string; type: string; notnull: number; dflt_value: string | null }>;
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "label",
        "provider",
        "api_key",
        "key_hint",
        "created_at",
        "updated_at",
      ])
    );
    db.close();
  });

  it("api_key is NOT NULL (plaintext storage, no encryption)", () => {
    const db = freshDb();
    expect(() =>
      db
        .prepare("INSERT INTO credentials (id, label, provider, api_key) VALUES (?, ?, ?, ?)")
        .run("c1", "Test", "anthropic", null)
    ).toThrow(/NOT NULL/i);
    db.close();
  });
});

describe("Migration 006 — models table shape", () => {
  it("creates all 12 is_default_<task> columns", () => {
    const db = freshDb();
    const cols = db
      .prepare("PRAGMA table_info(models)")
      .all() as Array<{ name: string }>;
    const flags = cols.filter((c) => c.name.startsWith("is_default_")).map((c) => c.name);
    expect(flags).toEqual(
      expect.arrayContaining([
        "is_default_agent",
        "is_default_hindsight",
        "is_default_compression",
        "is_default_vision",
        "is_default_web_extract",
        "is_default_session_search",
        "is_default_title_generation",
        "is_default_skills_hub",
        "is_default_mcp",
        "is_default_triage_specifier",
        "is_default_approval",
        "is_default_delegation",
      ])
    );
    expect(flags).toHaveLength(12);
    db.close();
  });

  it("credentials_id FK sets to NULL on credential delete", () => {
    const db = freshDb();
    db.prepare(
      "INSERT INTO credentials (id, label, provider, api_key, key_hint) VALUES (?, ?, ?, ?, ?)"
    ).run("c1", "Test", "anthropic", "sk-real", "sk-...al");
    db.prepare(
      "INSERT INTO models (id, name, provider, model_id, credentials_id) VALUES (?, ?, ?, ?, ?)"
    ).run("m1", "Sonnet", "anthropic", "anthropic/claude-sonnet-4", "c1");

    db.prepare("DELETE FROM credentials WHERE id = ?").run("c1");
    const model = db.prepare("SELECT credentials_id FROM models WHERE id = ?").get("m1") as {
      credentials_id: string | null;
    };
    expect(model.credentials_id).toBeNull();
    db.close();
  });

  it("provider has no SQL CHECK constraint (validation deferred to API layer)", () => {
    const db = freshDb();
    expect(() =>
      db
        .prepare(
          "INSERT INTO models (id, name, provider, model_id) VALUES (?, ?, ?, ?)"
        )
        .run("m_unknown", "Custom", "some-future-provider-not-in-cli", "custom/model")
    ).not.toThrow();
    db.close();
  });
});

describe("Migration 006 — partial unique indexes", () => {
  function insertModel(
    db: import("better-sqlite3").Database,
    id: string,
    overrides: Partial<Record<string, unknown>> = {}
  ) {
    const cols: string[] = ["id", "name", "provider", "model_id"];
    const vals: unknown[] = [id, "Test", "anthropic", "anthropic/claude-sonnet-4"];
    for (const [k, v] of Object.entries(overrides)) {
      cols.push(k);
      vals.push(v);
    }
    const placeholders = cols.map(() => "?").join(", ");
    db.prepare(`INSERT INTO models (${cols.join(", ")}) VALUES (${placeholders})`).run(...vals);
  }

  it.each([
    "agent",
    "hindsight",
    "compression",
    "vision",
    "web_extract",
    "session_search",
    "title_generation",
    "skills_hub",
    "mcp",
    "triage_specifier",
    "approval",
    "delegation",
  ])("enforces a single default for is_default_%s", (slot) => {
    const db = freshDb();
    const flag = `is_default_${slot}`;
    insertModel(db, "m1", { [flag]: 1 });
    expect(() => insertModel(db, "m2", { [flag]: 1 })).toThrow(/UNIQUE/i);
    // But two non-defaults coexist fine (the partial index excludes 0).
    insertModel(db, "m3", { [flag]: 0 });
    insertModel(db, "m4", { [flag]: 0 });
    db.close();
  });

  it("CHECK constraint rejects values other than 0/1 for default flags", () => {
    const db = freshDb();
    expect(() =>
      db
        .prepare("INSERT INTO models (id, name, provider, model_id, is_default_agent) VALUES (?, ?, ?, ?, ?)")
        .run("m_bad", "X", "anthropic", "x", 2)
    ).toThrow(/CHECK/i);
    db.close();
  });

  it("a model can be the default for multiple slots simultaneously", () => {
    const db = freshDb();
    insertModel(db, "primary", { is_default_agent: 1, is_default_compression: 1, is_default_vision: 1 });
    const row = db
      .prepare(
        "SELECT is_default_agent, is_default_compression, is_default_vision FROM models WHERE id = ?"
      )
      .get("primary") as Record<string, number>;
    expect(row.is_default_agent).toBe(1);
    expect(row.is_default_compression).toBe(1);
    expect(row.is_default_vision).toBe(1);
    db.close();
  });
});

describe("Migration 006 — auxiliary indexes", () => {
  it("creates idx_models_provider and idx_models_credentials", () => {
    const db = freshDb();
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'models'")
      .all() as Array<{ name: string }>;
    const names = indexes.map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(["idx_models_provider", "idx_models_credentials"]));
  });
});
