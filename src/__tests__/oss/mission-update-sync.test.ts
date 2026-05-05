/** @jest-environment node */

/**
 * Regression test: mission update action must sync skills and profile
 * to the associated cron job. Previously, only prompt/timeout/name/schedule
 * were synced — skills and profile changes were silently lost.
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
        statusText: "OK",
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

// Mock backends with require() factory
jest.mock("@/lib/backends", () => {
  const dispatchMission = jest.fn();
  const pauseMission = jest.fn();
  const resumeMission = jest.fn();
  const cancelMission = jest.fn();
  const getMissionStatus = jest.fn();

  return {
    agentBackend: {
      dispatchMission,
      pauseMission,
      resumeMission,
      cancelMission,
      getMissionStatus,
    },
    __dispatchMission: dispatchMission,
    __pauseMission: pauseMission,
    __resumeMission: resumeMission,
    __cancelMission: cancelMission,
    __getMissionStatus: getMissionStatus,
  };
});

// Mock jobs-repository with require() factory
jest.mock("@/lib/jobs-repository", () => {
  const readJobsFile = jest.fn();
  const writeJobsFile = jest.fn();
  const withJobsFileLock = jest.fn();

  return {
    readJobsFile,
    writeJobsFile,
    withJobsFileLock,
    __readJobsFile: readJobsFile,
    __writeJobsFile: writeJobsFile,
    __withJobsFileLock: withJobsFileLock,
  };
});

// Mock mission-repository with require() factory
jest.mock("@/lib/mission-repository", () => {
  const loadMission = jest.fn();
  const saveMission = jest.fn();
  const updateMission = jest.fn();
  const listMissions = jest.fn();

  return {
    ensureMissionsDir: jest.fn(),
    getMissionsDataDir: jest.fn(() => "/tmp/test-hermes/missions"),
    loadMission,
    saveMission,
    updateMission,
    listMissions,
    sanitizeMissionId: jest.fn((id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "")),
    __loadMission: loadMission,
    __saveMission: saveMission,
    __updateMission: updateMission,
    __listMissions: listMissions,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const backends = require("@/lib/backends") as Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jobsRepo = require("@/lib/jobs-repository") as Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const missionRepo = require("@/lib/mission-repository") as Record<string, unknown>;

const mockLoadMission = missionRepo.__loadMission as jest.Mock;
const mockSaveMission = missionRepo.__saveMission as jest.Mock;
const mockUpdateMission = missionRepo.__updateMission as jest.Mock;
const mockWithJobsFileLock = jobsRepo.__withJobsFileLock as jest.Mock;

const mockMissionData = {
  id: "m_test123",
  name: "Test Mission",
  prompt: "Original prompt",
  goals: ["Goal 1"],
  skills: ["old-skill"],
  model: "test-model",
  profile: "old-profile",
  missionTimeMinutes: 15,
  timeoutMinutes: 10,
  schedule: "every 5m",
  status: "dispatched" as const,
  dispatchMode: "cron" as const,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  results: null,
  duration: null,
  error: null,
  templateId: null,
  cronJobId: "mission-m_test123",
};

describe("POST /api/missions — update action syncs skills/profile to cron job", () => {
  let capturedCallback: ((jobs: unknown[]) => unknown) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedCallback = null;

    mockLoadMission.mockReturnValue({ ...mockMissionData });
    mockSaveMission.mockReturnValue(undefined);
    mockUpdateMission.mockReturnValue({ ...mockMissionData });

    mockWithJobsFileLock.mockImplementation(
      (_path: string, _backup: string, fn: (jobs: unknown[]) => unknown) => {
        capturedCallback = fn;
        const result = fn([
          {
            id: "mission-m_test123",
            name: "Mission: Test Mission",
            prompt: "Original prompt",
            skills: ["old-skill"],
            model: "test-model",
            profile: "old-profile",
            enabled: true,
            state: "scheduled",
            schedule: { kind: "interval" as const, minutes: 5, display: "every 5m" },
            repeat: { times: null, completed: 0 },
            mission_id: "m_test123",
            timeout: 600,
          },
        ]);
        return { ok: true, value: result };
      }
    );
  });

  it("syncs skills to cron job when mission skills are updated", async () => {
    mockUpdateMission.mockReturnValue({ ...mockMissionData, skills: ["new-skill-1", "new-skill-2"] });

    const { POST } = await import("@/app/api/missions/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", missionId: "m_test123", skills: ["new-skill-1", "new-skill-2"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockWithJobsFileLock).toHaveBeenCalled();

    expect(capturedCallback).not.toBeNull();
    const jobs = [
      {
        id: "mission-m_test123",
        name: "Mission: Test Mission",
        prompt: "Original prompt",
        skills: ["old-skill"],
        model: "test-model",
        profile: "old-profile",
        enabled: true,
        state: "scheduled",
        schedule: { kind: "interval" as const, minutes: 5, display: "every 5m" },
        repeat: { times: null, completed: 0 },
        mission_id: "m_test123",
        timeout: 600,
      },
    ];
    const result = capturedCallback!(jobs) as { action: string; jobs: Array<Record<string, unknown>> };
    expect(result.action).toBe("write");
    expect(result.jobs[0].skills).toEqual(["new-skill-1", "new-skill-2"]);
  });

  it("syncs profile to cron job when mission profile is updated", async () => {
    mockUpdateMission.mockReturnValue({ ...mockMissionData, profile: "new-profile" });

    const { POST } = await import("@/app/api/missions/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", missionId: "m_test123", profile: "new-profile" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockWithJobsFileLock).toHaveBeenCalled();

    const jobs = [
      {
        id: "mission-m_test123",
        name: "Mission: Test Mission",
        prompt: "Original prompt",
        skills: ["old-skill"],
        model: "test-model",
        profile: "old-profile",
        enabled: true,
        state: "scheduled",
        schedule: { kind: "interval" as const, minutes: 5, display: "every 5m" },
        repeat: { times: null, completed: 0 },
        mission_id: "m_test123",
        timeout: 600,
      },
    ];
    const result = capturedCallback!(jobs) as { action: string; jobs: Array<Record<string, unknown>> };
    expect(result.jobs[0].profile).toBe("new-profile");
  });

  it("does NOT modify skills when skills field is not in payload", async () => {
    mockUpdateMission.mockReturnValue({ ...mockMissionData, name: "Renamed Mission" });

    const { POST } = await import("@/app/api/missions/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", missionId: "m_test123", name: "Renamed Mission" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const jobs = [
      {
        id: "mission-m_test123",
        name: "Mission: Test Mission",
        prompt: "Original prompt",
        skills: ["old-skill"],
        model: "test-model",
        profile: "old-profile",
        enabled: true,
        state: "scheduled",
        schedule: { kind: "interval" as const, minutes: 5, display: "every 5m" },
        repeat: { times: null, completed: 0 },
        mission_id: "m_test123",
        timeout: 600,
      },
    ];
    const result = capturedCallback!(jobs) as { action: string; jobs: Array<Record<string, unknown>> };
    expect(result.jobs[0].skills).toEqual(["old-skill"]);
    expect(result.jobs[0].profile).toBe("old-profile");
    expect(result.jobs[0].name).toBe("Mission: Renamed Mission");
  });
});
