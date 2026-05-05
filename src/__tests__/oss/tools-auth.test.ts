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

jest.mock("@/lib/hermes", () => ({
  HERMES_HOME: "/tmp/test-hermes",
  HERMES_PATHS: {
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
    userMd: "/tmp/test-hermes/.env",
    memoryMd: "/tmp/test-hermes/memory_store.db",
  },
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
