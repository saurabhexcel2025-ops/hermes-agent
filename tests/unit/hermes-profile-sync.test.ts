/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */

import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { execBaselineSchema } from "../helpers/baseline-db";

let testDb: import("better-sqlite3").Database | null = null;
let hermesRoot = "";

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

jest.mock("@/lib/hermes-profile-paths", () => {
  const actual = jest.requireActual("@/lib/hermes-profile-paths") as typeof import("@/lib/hermes-profile-paths");
  return {
    ...actual,
    getHermesDefaultRoot: () => hermesRoot,
    resolveProfileHermesHome: (slug: string) => join(hermesRoot, "profiles", slug),
  };
});

beforeEach(() => {
  const Database = loadRealBetterSqlite3();
  testDb = new (Database as unknown as new (path: string) => import("better-sqlite3").Database)(
    ":memory:"
  );
  testDb.pragma("foreign_keys = ON");
  execBaselineSchema(testDb);
  hermesRoot = mkdtempSync(join(tmpdir(), "ch-hermes-sync-"));
  writeFileSync(join(hermesRoot, "config.yaml"), "version: 1\n");
});

afterEach(() => {
  testDb?.close();
  testDb = null;
});

describe("hermes-profile-sync", () => {
  it("push writes SOUL.md and pull reads it back", () => {
    const { upsertProfile } = require("@/lib/profiles-repository") as typeof import("@/lib/profiles-repository");
    const {
      pushProfileToHermes,
      pullProfileFromHermes,
      detectProfileDrift,
    } = require("@/lib/hermes-profile-sync") as typeof import("@/lib/hermes-profile-sync");

    upsertProfile({
      slug: "qa",
      displayName: "QA",
      soulMd: "# From DB",
      agentsMd: "# Agents",
      configYaml: "agent:\n  personality: technical\n",
    });

    const push = pushProfileToHermes("qa");
    expect(push.success).toBe(true);
    const soulPath = join(hermesRoot, "profiles", "qa", "SOUL.md");
    expect(existsSync(soulPath)).toBe(true);
    expect(readFileSync(soulPath, "utf-8")).toBe("# From DB");

    writeFileSync(soulPath, "# On disk");
    expect(detectProfileDrift("qa").drifted).toBe(true);

    const pull = pullProfileFromHermes("qa");
    expect(pull.success).toBe(true);
    const { getProfile } = require("@/lib/profiles-repository") as typeof import("@/lib/profiles-repository");
    expect(getProfile("qa")?.soulMd).toBe("# On disk");
  });
});
