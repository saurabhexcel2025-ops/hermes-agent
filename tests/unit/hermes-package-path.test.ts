/** @jest-environment node */

import { existsSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";

jest.mock("fs", () => ({
  ...jest.requireActual<typeof import("fs")>("fs"),
  existsSync: jest.fn(jest.requireActual<typeof import("fs")>("fs").existsSync),
}));

import {
  listHermesAgentPackageCandidates,
  resolveHermesAgentPackage,
} from "@/lib/hermes-package-path";

const existsSyncMock = existsSync as jest.MockedFunction<typeof existsSync>;

describe("hermes-package-path", () => {
  afterEach(() => {
    existsSyncMock.mockImplementation(jest.requireActual<typeof import("fs")>("fs").existsSync);
    delete process.env.HERMES_AGENT_ROOT;
  });

  it("finds package under hermes home", () => {
    const base = mkdtempSync(join(tmpdir(), "ch-hermes-pkg-"));
    const pkg = join(base, "hermes-agent");
    mkdirSync(join(pkg, "cron"), { recursive: true });
    writeFileSync(join(pkg, "cron", "jobs.py"), "# stub\n");

    existsSyncMock.mockImplementation((p) => {
      const s = String(p);
      if (s === join(pkg, "cron", "jobs.py")) return true;
      return jest.requireActual<typeof import("fs")>("fs").existsSync(p);
    });

    expect(resolveHermesAgentPackage(base)).toBe(resolve(pkg));
    expect(resolve(listHermesAgentPackageCandidates(base)[0])).toBe(resolve(pkg));
  });

  it("honors HERMES_AGENT_ROOT override", () => {
    const base = mkdtempSync(join(tmpdir(), "ch-hermes-override-"));
    const pkg = join(base, "custom-agent");
    mkdirSync(join(pkg, "cron"), { recursive: true });
    writeFileSync(join(pkg, "cron", "jobs.py"), "# stub\n");
    process.env.HERMES_AGENT_ROOT = pkg;

    existsSyncMock.mockImplementation((p) => {
      if (String(p) === join(pkg, "cron", "jobs.py")) return true;
      return false;
    });

    expect(resolveHermesAgentPackage(join(base, "unused-home"))).toBe(pkg);
  });
});
