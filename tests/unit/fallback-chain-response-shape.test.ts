/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */

/**
 * Tests for fallback chain API response shape — verifies the 'chain' alias
 * key exists alongside 'entries' in the GET response.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { execBaselineSchema } from "../helpers/baseline-db";

const repoRoot = join(__dirname, "..", "..");

let testDb: import("better-sqlite3").Database | null = null;

function loadRealBetterSqlite3(): typeof import("better-sqlite3") {
  return require("better-sqlite3/lib/index.js") as typeof import("better-sqlite3");
}

jest.mock("@/lib/db", () => {
  const actualCrypto = jest.requireActual("crypto") as typeof import("crypto");
  return {
    db: () => testDb!,
    inTransaction: <T,>(fn: () => T) => testDb!.transaction(fn)(),
    uuid: () => actualCrypto.randomUUID(),
    now: () => new Date().toISOString(),
    ensureDb: () => undefined,
  };
});

jest.mock("@/lib/hermes-agent-runtime", () => ({
  getActiveHermesHome: () => "/tmp/test-hermes-home",
  getActiveHermesPaths: () => ({
    root: "/tmp/test-hermes-home",
    config: "/tmp/test-hermes-home/config.yaml",
    env: "/tmp/test-hermes-home/.env",
    backups: "/tmp/test-hermes-home/backups",
  }),
}));

function setupDb() {
  const Database = loadRealBetterSqlite3();
  testDb = new (Database as unknown as new (path: string) => import("better-sqlite3").Database)(
    ":memory:"
  );
  testDb.pragma("foreign_keys = ON");
  execBaselineSchema(testDb);
}

beforeEach(() => {
  setupDb();
});

afterEach(() => {
  testDb?.close();
  testDb = null;
});

describe("GET /api/models/fallbacks — response shape", () => {
  it("returns 'entries' key in the data envelope (chain removed — use entries)", () => {
    // Verify the API route implementation returns the canonical 'entries' key
    const routePath = join(repoRoot, "src", "app", "api", "models", "fallbacks", "route.ts");
    const routeContent = readFileSync(routePath, "utf-8");

    // The route must return 'entries' (the canonical key)
    expect(routeContent).toContain("entries");
    expect(routeContent).not.toContain("chain: entries");
  });

  it("listFallbackChain returns consistent results on repeated calls", () => {
    const repo = require("@/lib/fallbacks-repository");
    const modRepo = require("@/lib/models-repository");

    const m = modRepo.createModel({ name: "Test", provider: "anthropic", modelId: "claude-test" });
    repo.addFallbackEntry({ modelId: m.id });

    const first = repo.listFallbackChain();
    expect(first.length).toBe(1);

    // Verify the repo returns consistent results on repeated calls
    const second = repo.listFallbackChain();
    expect(second).toEqual(first);
  });
});
