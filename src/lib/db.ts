// ═══════════════════════════════════════════════════════════════
// db.ts — SQLite connection + migration runner
// Database: ~/control-hub/data/control-hub.db
// ═══════════════════════════════════════════════════════════════

import Database from "better-sqlite3";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { CH_DATA_DIR } from "./paths";

// ── Ensure data directory exists ───────────────────────────────

const dataDir = CH_DATA_DIR;
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = join(dataDir, "control-hub.db");

// ── Connection factory ─────────────────────────────────────────

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("busy_timeout = 5000");

  // Run migrations
  runMigrations(_db);

  return _db;
}

/** Alias — most code uses db() not getDb() */
export const db = getDb;

// ── Shorthand helpers ─────────────────────────────────────────

export function inTransaction<T>(fn: () => T): T {
  const database = db();
  return database.transaction(fn)();
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

// ── Migration runner ───────────────────────────────────────────

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

function runMigrations(database: Database.Database): void {
  // Ensure meta table exists first
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const currentVersion = getSchemaVersion(database);
  const migrationsDir = join(__dirname, "db", "migrations");

  // Collect migration files
  let migrations: Array<{ num: number; sql: string }> = [];
  try {
    const { readdirSync } = require("fs");
    const files = readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const num = parseInt(file.split("_")[0], 10);
      if (!isNaN(num) && num > currentVersion) {
        const sql = readFileSync(join(migrationsDir, file), "utf-8");
        migrations.push({ num, sql });
      }
    }
  } catch {
    // No migrations dir — schema shipped via pre-baked DB
  }

  for (const { num, sql } of migrations) {
    database.exec(sql);
    setSchemaVersion(database, num);
  }
}

// ── Bootstrap: ensure DB + schema exist ───────────────────────
// Call this at module load time for API routes that need the DB
// immediately (before first query).

let _bootstrapped = false;

export function ensureDb(): void {
  if (_bootstrapped) return;
  _bootstrapped = true;
  db(); // forces open + migrate
}
