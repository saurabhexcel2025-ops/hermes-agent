/** @jest-environment node */

// These tests verify auth middleware is correctly wired on tool routes.
// /api/tools only has GET and POST — PUT is tested via POST(action="configure").

const mockRequireMcApiKey = jest.fn();
const mockRequireNotReadOnly = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockExistsSync = jest.fn();

jest.mock("fs", () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
}));

jest.mock("@/lib/hermes-agent-runtime", () => ({
  getActiveHermesPaths: jest.fn(() => ({
    root: "/tmp/test-hermes",
    config: "/tmp/test-hermes/config.yaml",
    env: "/tmp/test-hermes/.env",
    skills: "/tmp/test-hermes/skills",
    sessions: "/tmp/test-hermes/sessions",
    logs: "/tmp/test-hermes/logs",
    memoryDb: "/tmp/test-hermes/memory_store.db",
    cronJobs: "/tmp/test-hermes/cron/jobs.json",
    backups: "/tmp/test-hermes/backups",
    hermes: "/tmp/test-hermes/HERMES.md",
    agents: "/tmp/test-hermes/AGENTS.md",
    profiles: "/tmp/test-hermes/profiles",
    soul: "/tmp/test-hermes/SOUL.md",
  })),
  getActiveHermesHome: jest.fn(() => "/tmp/test-hermes"),
  getAgentLlmEndpoints: jest.fn(() => ({
    apiUrl: "http://127.0.0.1:9/v1/chat/completions",
    gatewayBase: "http://127.0.0.1:9",
  })),
}));

jest.mock("@/lib/paths", () => ({
  CH_DATA_DIR: "/tmp/ch-data",
  PATHS: {
    missions: "/tmp/ch-data/missions",
    controlHubDb: "/tmp/ch-data/control-hub.db",
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
  requireMcApiKey: mockRequireMcApiKey,
  requireNotReadOnly: mockRequireNotReadOnly,
}));

import { NextRequest } from "next/server";

describe("POST /api/tools configure action auth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it("rejects when read-only mode is active", async () => {
    const readOnlyResponse = new Response("Read only", { status: 403 });
    mockRequireNotReadOnly.mockReturnValue(readOnlyResponse);
    mockRequireMcApiKey.mockReturnValue(null);

    const req = new NextRequest("http://localhost/api/tools", {
      method: "POST",
      body: JSON.stringify({ action: "configure", id: "terminal", enabled: true }),
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(mockRequireNotReadOnly).toHaveBeenCalled();
  });

  it("rejects when API key is missing/invalid", async () => {
    mockRequireNotReadOnly.mockReturnValue(null);
    const authResponse = new Response("Unauthorized", { status: 401 });
    mockRequireMcApiKey.mockReturnValue(authResponse);

    const req = new NextRequest("http://localhost/api/tools", {
      method: "POST",
      body: JSON.stringify({ action: "configure", id: "terminal", enabled: true }),
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockRequireMcApiKey).toHaveBeenCalled();
  });

  it("proceeds when auth passes", async () => {
    mockRequireNotReadOnly.mockReturnValue(null);
    mockRequireMcApiKey.mockReturnValue(null);

    const req = new NextRequest("http://localhost/api/tools", {
      method: "POST",
      body: JSON.stringify({ action: "configure", id: "terminal", enabled: true }),
    });
    const res = await POST(req);

    // Should proceed past auth checks (not 401/403)
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// Helper to call POST /api/tools
async function POST(req: NextRequest) {
  const { POST } = await import("@/app/api/tools/route");
  return POST(req);
}
