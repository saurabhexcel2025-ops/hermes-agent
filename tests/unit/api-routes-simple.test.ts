/** @jest-environment node */

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockStatSync = jest.fn();

jest.mock("fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

const testHermesRoot = "/tmp/test-hermes";
const testHermesPaths = {
  root: testHermesRoot,
  env: testHermesRoot + "/.env",
  soul: testHermesRoot + "/SOUL.md",
  hermes: testHermesRoot + "/HERMES.md",
  agents: testHermesRoot + "/AGENTS.md",
  skills: testHermesRoot + "/skills",
  profiles: testHermesRoot + "/profiles",
  sessions: testHermesRoot + "/sessions",
  logs: testHermesRoot + "/logs",
  config: testHermesRoot + "/config.yaml",
  backups: testHermesRoot + "/backups",
  cronJobs: testHermesRoot + "/cron/jobs.json",
  memoryDb: testHermesRoot + "/memory_store.db",
};

jest.mock("@/lib/hermes-agent-runtime", () => ({
  getActiveHermesPaths: jest.fn(() => testHermesPaths),
  getActiveHermesHome: jest.fn(() => testHermesRoot),
  getAgentLlmEndpoints: jest.fn(() => ({
    apiUrl: "http://127.0.0.1:9/v1/chat/completions",
    gatewayBase: "http://127.0.0.1:9",
  })),
}));

jest.mock("@/lib/paths", () => ({
  CH_DATA_DIR: "/tmp/ch-data",
  getChDataDir: () => "/tmp/ch-data",
  PATHS: {
    controlHubDb: "/tmp/ch-data/control-hub.db",
    missions: "/tmp/ch-data/missions",
    templates: "/tmp/ch-data/templates",
    stories: "/tmp/ch-data/stories",
    recroom: "/tmp/ch-data/recroom",
    workspaces: "/tmp/ch-data/workspaces",
    teams: "/tmp/ch-data/teams",
    auditLog: "/tmp/ch-data/audit",
    chScripts: "/tmp/ch-data/scripts",
    chHardwareLogs: "/tmp/ch-data/logs",
  },
  getChScriptsDir: () => "/tmp/ch-data/scripts",
  getChHardwareLogDir: () => "/tmp/ch-data/logs",
}));

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
}));

jest.mock("@/lib/sessions-api-guard", () => ({
  sessionsRateLimitResponse: jest.fn(() => null),
}));

jest.mock("@/lib/session-repository", () => ({
  createSession: jest.fn(),
  updateSession: jest.fn(),
  getSession: jest.fn(),
  listSessions: jest.fn(() => ({ sessions: [], total: 0 })),
  syncHermesSessionsToDb: jest.fn(() => ({ synced: 0 })),
}));

import { NextRequest } from "next/server";

describe("GET /api/status", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns system status with file checks", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["file1.json", "file2.json"]);

    const { GET } = await import("@/app/api/status/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toBeDefined();
    expect(typeof data.data.soulFile).toBe("boolean");
    expect(typeof data.data.configFile).toBe("boolean");
  });
});

describe("GET /api/gateway", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns gateway status with platforms", async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith("config.yaml")) return true;
      if (p.endsWith(".env")) return true;
      if (p.endsWith("gateway.log")) return false;
      return false;
    });
    mockReadFileSync.mockReturnValue("platform_toolsets:\n  cli:\n    - terminal\n");

    const { GET } = await import("@/app/api/gateway/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toBeDefined();
  });

  it("handles missing config gracefully", async () => {
    mockExistsSync.mockReturnValue(false);

    const { GET } = await import("@/app/api/gateway/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toBeDefined();
  });
});

describe("GET /api/logs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 404 when no logs directory", async () => {
    mockExistsSync.mockReturnValue(false);

    const request = new Request("http://localhost/api/logs");
    const { GET } = await import("@/app/api/logs/route");
    const res = await GET(request);

    expect(res.status).toBe(404);
  });

  it("returns log data when logs exist", async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith("/logs")) return true;
      if (p.endsWith("agent.log")) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue(["agent.log"]);
    mockStatSync.mockReturnValue({ size: 100, mtime: new Date("2026-01-01") });
    mockReadFileSync.mockReturnValue("[INFO] Started\n[ERROR] Something broke\n");

    const request = new Request("http://localhost/api/logs");
    const { GET } = await import("@/app/api/logs/route");
    const res = await GET(request);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data.lines)).toBe(true);
  });
});

describe("GET /api/sessions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns empty list when no sessions directory", async () => {
    mockExistsSync.mockReturnValue(false);

    const request = new NextRequest("http://localhost/api/sessions");
    const { GET } = await import("@/app/api/sessions/route");
    const res = await GET(request);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.sessions).toEqual([]);
    expect(data.data.total).toBe(0);
  });

  it("lists session files", async () => {
    // New architecture: sessions come from the unified sessions table (DB).
    // The route syncs Hermes files to DB then reads from listSessions().
    // Override the default mock for this specific test.
    const { listSessions, syncHermesSessionsToDb } = await import(
      "@/lib/session-repository"
    );
    (listSessions as jest.Mock).mockReturnValueOnce({
      sessions: [
        {
          id: "session_abc",
          agentType: "hermes",
          source: "cli",
          missionId: null,
          profileName: null,
          modelId: null,
          provider: null,
          title: "session_abc",
          size: 1024,
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: null,
          status: "active",
          exitCode: null,
          error: null,
        },
      ],
      total: 1,
    });
    (syncHermesSessionsToDb as jest.Mock).mockReturnValueOnce({ synced: 1 });

    const request = new NextRequest("http://localhost/api/sessions");
    const { GET } = await import("@/app/api/sessions/route");
    const res = await GET(request);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.sessions.length).toBe(1);
    expect(data.data.total).toBe(1);
  });
});

describe("GET /api/monitor", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns aggregated status", async () => {
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);

    const { GET } = await import("@/app/api/monitor/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toBeDefined();
    expect(data.data.cron).toBeDefined();
    expect(data.data.memory).toBeDefined();
  });
});
