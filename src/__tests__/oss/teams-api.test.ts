// ═══════════════════════════════════════════════════════════════
// teams-api.test.ts — Unit tests for /api/teams route
// ═══════════════════════════════════════════════════════════════

/** @jest-environment node */

jest.mock("fs");
jest.mock("@/lib/hermes", () => ({
  HERMES_HOME: "/tmp/test-hermes",
  PATHS: { workspaces: "/tmp/test-workspaces", missions: "/tmp/test-missions", goals: "/tmp/test-goals", kanban: "/tmp/test-kanban" },
}));
jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
}));
jest.mock("@/lib/audit-log", () => ({
  appendAuditLine: jest.fn(),
}));

// ── Mock next/server at top level (prevents Next.js internal module loading) ──
jest.mock("next/server", () => ({
  NextRequest: class NextRequest {
    url: string;
    method: string;
    headers: Headers;
    constructor(url: string, init?: RequestInit) {
      this.url = url;
      this.method = init?.method ?? "GET";
      this.headers = new Headers(init?.headers as HeadersInit);
    }
    json(): Promise<unknown> {
      const text = (this as Record<string, unknown>).body as string;
      return Promise.resolve(JSON.parse(text ?? "{}"));
    }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => {
      const status = init?.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 201 ? "Created" : status === 400 ? "Bad Request" : status === 404 ? "Not Found" : status === 409 ? "Conflict" : "OK",
        headers: new Headers(),
        json: async () => data,
      };
    },
  },
}));

// ── Pre-defined types ────────────────────────────────────────
type ApiRes = { status: number; json(): Promise<Record<string, unknown>> };

// ── Route loaders ────────────────────────────────────────────
async function getRoute(path: string): Promise<ApiRes> {
  const { GET } = await import("@/app/api/teams/route");
  const req = { url: `http://localhost${path}`, method: "GET", headers: new Headers() } as unknown as Request;
  return GET(req) as unknown as ApiRes;
}

async function postRoute(path: string, body: Record<string, unknown>): Promise<ApiRes> {
  const { POST } = await import("@/app/api/teams/route");
  const req = {
    url: `http://localhost${path}`,
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
    json: async () => JSON.parse(JSON.stringify(body)),
  } as unknown as Request;
  return POST(req) as unknown as ApiRes;
}

// ── Test data ─────────────────────────────────────────────────
const TEAM_DATA = {
  id: "team_test123",
  name: "Platform Team",
  description: "Platform engineering",
  leaderProfileId: "bob",
  members: [
    { profileId: "bob", role: "leader", joinedAt: "2025-01-01T00:00:00.000Z" },
    { profileId: "alice", role: "specialist", joinedAt: "2025-01-01T00:00:00.000Z" },
  ],
  boardIds: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

// ── Import fs mocks AFTER jest.mock ───────────────────────────
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";

function setupFsMocks() {
  (existsSync as jest.Mock).mockReturnValue(false);
  (mkdirSync as jest.Mock).mockReturnValue(undefined);
  (writeFileSync as jest.Mock).mockReturnValue(undefined);
  (readFileSync as jest.Mock).mockReturnValue(undefined);
  (readdirSync as jest.Mock).mockReturnValue([]);
  (unlinkSync as jest.Mock).mockReturnValue(undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  setupFsMocks();
});

describe("GET /api/teams", () => {
  it("returns empty teams list when directory is empty", async () => {
    const res = await getRoute("/api/teams");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ data: { teams: [] } });
  });

  it("returns a specific team when ?id= is provided", async () => {
    (existsSync as jest.Mock).mockImplementation((p: string) => p.includes(".team.json"));
    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(TEAM_DATA));
    const res = await getRoute("/api/teams?id=team_test123");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("data");
  });

  it("returns 404 for a non-existent team", async () => {
    (existsSync as jest.Mock).mockReturnValue(false);
    const res = await getRoute("/api/teams?id=nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/teams — create", () => {
  it("creates a new team with the leader as first member", async () => {
    (existsSync as jest.Mock).mockReturnValue(false);
    const res = await postRoute("/api/teams", {
      action: "create",
      name: "Data Engineering Team",
      description: "Build data pipelines",
      leaderProfileId: "data-engineer",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toHaveProperty("data");
  });

  it("rejects a team without a name", async () => {
    const res = await postRoute("/api/teams", { action: "create", leaderProfileId: "bob" });
    expect(res.status).toBe(400);
  });

  it("rejects a team without a leader", async () => {
    const res = await postRoute("/api/teams", { action: "create", name: "Team Without Lead" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/teams — add-member", () => {
  it("adds a member to an existing team", async () => {
    (existsSync as jest.Mock).mockImplementation((p: string) => p.includes(".team.json"));
    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(TEAM_DATA));
    const res = await postRoute("/api/teams", {
      action: "add-member",
      teamId: "team_test123",
      profileId: "charlie",
      role: "reviewer",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("data");
  });

  it("rejects duplicate member", async () => {
    (existsSync as jest.Mock).mockImplementation((p: string) => p.includes(".team.json"));
    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(TEAM_DATA));
    const res = await postRoute("/api/teams", {
      action: "add-member",
      teamId: "team_test123",
      profileId: "bob",
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/teams — delete", () => {
  it("deletes an existing team", async () => {
    (existsSync as jest.Mock).mockReturnValue(true);
    const res = await postRoute("/api/teams", { action: "delete", teamId: "team_test123" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ data: { deleted: "team_test123" } });
    expect(unlinkSync).toHaveBeenCalled();
  });
});
