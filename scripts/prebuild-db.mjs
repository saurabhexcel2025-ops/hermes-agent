// scripts/prebuild-db.mjs
// Forces SQLite migrations before `next build`.
// Run automatically via `prebuild` npm script.

import Database from "better-sqlite3";
import { readFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DB_DIR = join(ROOT, "data");
const DB_PATH = join(DB_DIR, "control-hub.db");
const MIGRATIONS_DIR = join(ROOT, "src/lib/db/migrations");

// Ensure data dir
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

// Bootstrap meta table
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function getSchemaVersion(database) {
  const row = database.prepare("SELECT value FROM meta WHERE key = ?").get("schema_version");
  return row ? parseInt(row.value, 10) : 0;
}

function setSchemaVersion(database, version) {
  database.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("schema_version", String(version));
}

// Run pending migrations
const currentVersion = getSchemaVersion(db);
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let applied = 0;
for (const file of files) {
  const num = parseInt(file.split("_")[0], 10);
  if (!isNaN(num) && num > currentVersion) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    db.exec(sql);
    setSchemaVersion(db, num);
    console.log(`✓ Migration ${num} (${file}) applied`);
    applied++;
  }
}

if (applied === 0) {
  console.log("✓ Database schema up to date");
} else {
  console.log(`✓ ${applied} migration(s) applied`);
}

db.close();
