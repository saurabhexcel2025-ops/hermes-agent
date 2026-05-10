// ═══════════════════════════════════════════════════════════════
// update-api.test.ts — /api/update GET/POST behaviour
// ═══════════════════════════════════════════════════════════════

/** @jest-environment node */

const mockExecSync = jest.fn();
const mockExecFileSync = jest.fn();
const mockSpawn = jest.fn();

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => {
      const status = init?.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
      };
    },
  },
}));

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
}));

jest.mock("@/lib/audit-log", () => ({
  appendAuditLine: jest.fn(),
}));

jest.mock("child_process", () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

jest.mock("fs", () => ({
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn(() => ""),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

let deployApiEnabled = true;
let readOnlyGate: { status: number; json: () => Promise<unknown> } | null = null;

jest.mock("@/lib/api-auth", () => ({
  getCorrelationId: () => "cid-test",
  requireChApiKey: () => null,
  requireDeployApiEnabled: () =>
    deployApiEnabled
      ? null
      : { status: 403, json: () => Promise.resolve({ error: "off" }) },
  requireNotReadOnly: () => readOnlyGate,
  requireSignedRequest: () => null,
}));

function getReq(url: string): { url: string } {
  return { url };
}

describe("GET /api/update", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
    mockExecFileSync.mockReset();
    mockSpawn.mockReset();
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd !== "git") return "";
      const sub = args[0];
      if (sub === "fetch") return "";
      if (sub === "rev-parse" && args.includes("--abbrev-ref")) return "dev";
      if (sub === "rev-parse" && args.some((a) => String(a).startsWith("origin/")))
        return "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      if (sub === "rev-parse" && args.includes("HEAD")) return "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      if (sub === "log") return "msg";
      if (sub === "rev-list") return "0";
      return "";
    });
  });

  it("returns branches=1 with sanitized remote list", async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("git branch -r")) {
        return "origin/main\norigin/dev\norigin/HEAD\norigin/feature_x\n";
      }
      return "";
    });
    const { GET } = await import("@/app/api/update/route");
    const res = await GET(getReq("http://localhost/api/update?branches=1") as never);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body.data.branches).toContain("main");
    expect(body.data.branches).toContain("dev");
    expect(body.data.branches).toContain("feature_x");
  });

  it("GET check maps branch to checkout and comparedBranch", async () => {
    const { GET } = await import("@/app/api/update/route");
    const res = await GET(getReq("http://localhost/api/update?branch=dev") as never);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body.data.branch).toBe("dev");
    expect(body.data.comparedBranch).toBe("dev");
    expect(body.data.checkoutBranch).toBe("dev");
  });
});

describe("POST /api/update", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
    mockExecFileSync.mockReset();
    mockSpawn.mockReset();
    deployApiEnabled = true;
    readOnlyGate = null;
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "bash" && args[0] === "-n") return "" as unknown as void;
      return "" as unknown as void;
    });
    mockSpawn.mockReturnValue({ pid: 4242, unref: jest.fn() });
  });

  function postReq(body: Record<string, unknown>) {
    return {
      url: "http://localhost/api/update",
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => body,
    } as never;
  }

  it("returns 403 when deploy API disabled", async () => {
    deployApiEnabled = false;
    const { POST } = await import("@/app/api/update/route");
    const res = await POST(postReq({ action: "restart" }));
    expect(res.status).toBe(403);
  });

  it("returns 503 when read-only", async () => {
    readOnlyGate = {
      status: 503,
      json: () => Promise.resolve({ error: "read only" }),
    };
    const { POST } = await import("@/app/api/update/route");
    const res = await POST(postReq({ action: "restart" }));
    expect(res.status).toBe(503);
  });

  it("returns 500 when spawn yields no pid", async () => {
    mockSpawn.mockReturnValue({ pid: undefined, unref: jest.fn() });
    const { POST } = await import("@/app/api/update/route");
    const res = await POST(postReq({ action: "restart" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(String(body.error)).toMatch(/systemd-run|nohup|bash/i);
  });

  it("returns 400 for unknown action", async () => {
    const { POST } = await import("@/app/api/update/route");
    const res = await POST(postReq({ action: "nope" }));
    expect(res.status).toBe(400);
  });
});
