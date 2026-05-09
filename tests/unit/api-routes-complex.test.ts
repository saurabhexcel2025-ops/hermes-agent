/** @jest-environment node */

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockStatSync = jest.fn();
const mockMkdirSync = jest.fn();

jest.mock("fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  mkdirSync: mockMkdirSync,
  rmSync: jest.fn(),
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
  getDefaultModelConfig: jest.fn(() => ({
    provider: "nous",
    model: "xiaomi/mimo-v2-pro",
    base_url: "",
    api_key: "",
  })),
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

jest.mock("@/lib/api-auth", () => ({
  requireMcApiKey: jest.fn(() => null),
  requireNotReadOnly: jest.fn(() => null),
}));

jest.mock("@/lib/audit-log", () => ({
  appendAuditLine: jest.fn(),
}));

jest.mock("@/lib/jobs-repository", () => ({
  readJobsFile: jest.fn(() => ({
    ok: true,
    jobs: [
      { id: "job1", name: "Test Job", prompt: "test", enabled: true, state: "scheduled", schedule: { kind: "interval", minutes: 5, display: "every 5m" }, repeat: { times: -1, completed: 0 }, skills: [], model: "", last_run_at: null, next_run_at: null },
    ],
  })),
  withJobsFileLock: jest.fn(async (_path, _backup, fn) => {
    const jobs = [
      { id: "job1", name: "Test Job", prompt: "test", enabled: true, state: "scheduled", schedule: { kind: "interval", minutes: 5, display: "every 5m" }, repeat: { times: -1, completed: 0 }, skills: [], model: "", last_run_at: null, next_run_at: null },
    ];
    const out = fn(jobs);
    if (out.action === "abort") return { ok: false, error: out.error };
    return { ok: true, value: out.value };
  }),
}));

jest.mock("@/lib/sessions-api-guard", () => ({
  sessionsRateLimitResponse: jest.fn(() => null),
}));

import { NextRequest } from "next/server";

describe("GET /api/cron", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns list of cron jobs", async () => {
    const { GET } = await import("@/app/api/cron/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.jobs).toHaveLength(1);
    expect(data.data.jobs[0].id).toBe("job1");
    expect(data.data.jobs[0].name).toBe("Test Job");
  });
});

describe("GET /api/tools", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns available toolsets", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("platform_toolsets:\n  cli:\n    - terminal\n    - file\ntoolsets:\n  - terminal\n  - file\n");

    const request = new NextRequest("http://localhost/api/tools");
    const { GET } = await import("@/app/api/tools/route");
    const res = await GET(request);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data.tools)).toBe(true);
  });

  it("returns tools list when config not found", async () => {
    mockExistsSync.mockReturnValue(false);

    const request = new NextRequest("http://localhost/api/tools");
    const { GET } = await import("@/app/api/tools/route");
    const res = await GET(request);

    // Route still returns 200 with available tools (seeded from SQLite)
    expect(res.status).toBe(200);
  });
});

describe("GET /api/config", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns parsed config", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("agent:\n  max_turns: 100\nmodel:\n  default: test-model\n");

    const { GET } = await import("@/app/api/config/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toBeDefined();
  });
});

describe("GET /api/skills", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns empty when no skills directory", async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith("skills")) return false;
      return false;
    });

    const { NextRequest } = await import("next/server");
    const request = new NextRequest("http://localhost/api/skills");
    const { GET } = await import("@/app/api/skills/route");
    const res = await GET(request);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toBeDefined();
    expect(data.data.total).toBe(0);
  });
});

describe("GET /api/templates", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns custom templates", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["test-template.json"]);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      id: "custom-1", name: "Custom Template", instruction: "Do stuff",
    }));

    const { GET } = await import("@/app/api/templates/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.templates).toBeDefined();
  });
});

describe("GET /api/memory", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns memory data with provider info", async () => {
    mockExistsSync.mockReturnValue(false);

    const { GET } = await import("@/app/api/memory/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toBeDefined();
    expect(data.data.provider).toBeDefined();
  });
});
