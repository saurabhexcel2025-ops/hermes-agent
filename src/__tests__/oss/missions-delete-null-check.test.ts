/** @jest-environment node */

/**
 * Regression test: mission delete action must return 404 when
 * loadMission returns null (corrupt or missing mission data),
 * not silently proceed to delete the file and leave orphaned cron jobs.
 */

jest.mock("next/server", () => ({
  NextRequest: class NextRequest {
    url: string;
    method: string;
    headers: Headers;
    bodyUsed: boolean = false;
    private _body: string;
    constructor(url: string, init?: RequestInit) {
      this.url = url;
      this.method = init?.method ?? "GET";
      this.headers = new Headers(init?.headers as HeadersInit);
      this._body = typeof init?.body === "string" ? init.body : JSON.stringify(init?.body ?? {});
    }
    async json() { return JSON.parse(this._body); }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => {
      const status = init?.status ?? 200;
      const res = {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 404 ? "Not Found" : "OK",
        headers: new Headers(),
        json: () => Promise.resolve(data),
      };
      return res;
    },
  },
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

jest.mock("@/lib/backends", () => ({
  agentBackend: {
    dispatchMission: jest.fn(),
    pauseMission: jest.fn(),
    resumeMission: jest.fn(),
    cancelMission: jest.fn(),
    getMissionStatus: jest.fn(),
  },
}));

jest.mock("@/lib/jobs-repository", () => ({
  readJobsFile: jest.fn(),
  writeJobsFile: jest.fn(),
  withJobsFileLock: jest.fn(),
}));

// Mock mission-repository using require() inside factory (no closure variables)
jest.mock("@/lib/mission-repository", () => {
  const loadMission = jest.fn();
  const saveMission = jest.fn();
  const deleteMission = jest.fn();
  const listMissions = jest.fn();

  return {
    ensureMissionsDir: jest.fn(),
    getMissionsDataDir: jest.fn(() => "/tmp/test-hermes/missions"),
    loadMission,
    saveMission,
    deleteMission,
    listMissions,
    sanitizeMissionId: jest.fn((id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "")),
    // Export refs for test access via require
    __loadMission: loadMission,
    __saveMission: saveMission,
    __deleteMission: deleteMission,
    __listMissions: listMissions,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const repo = require("@/lib/mission-repository") as Record<string, jest.Mock>;
const mockLoadMission = repo.__loadMission as jest.Mock;
const mockDeleteMission = repo.__deleteMission as jest.Mock;

describe("POST /api/missions — delete action returns 404 for missing mission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 404 when loadMission returns null", async () => {
    mockLoadMission.mockReturnValue(null);

    const { POST } = await import("@/app/api/missions/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", missionId: "m_nonexistent" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("does NOT call deleteMission when loadMission returns null", async () => {
    mockLoadMission.mockReturnValue(null);
    mockDeleteMission.mockReturnValue(true);

    const { POST } = await import("@/app/api/missions/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", missionId: "m_nonexistent" }),
    });

    await POST(req);
    expect(mockDeleteMission).not.toHaveBeenCalled();
  });

  it("successfully deletes when mission exists", async () => {
    mockLoadMission.mockReturnValue({
      id: "m_existing",
      name: "Test",
      cronJobId: null,
    });
    mockDeleteMission.mockReturnValue(true);

    const { POST } = await import("@/app/api/missions/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", missionId: "m_existing" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
  });

  it("returns 400 when missionId is missing", async () => {
    const { POST } = await import("@/app/api/missions/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
