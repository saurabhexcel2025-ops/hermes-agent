import { readFileSync } from "fs";
import { join } from "path";

export const baselineSqlPath = join(
  __dirname,
  "..",
  "..",
  "src",
  "lib",
  "db",
  "migrations",
  "001_baseline.sql"
);

/** Apply the squashed baseline schema to an open SQLite database. */
export function execBaselineSchema(database: import("better-sqlite3").Database): void {
  database.exec(readFileSync(baselineSqlPath, "utf-8"));
}
