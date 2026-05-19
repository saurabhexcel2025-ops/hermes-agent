/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */

jest.mock("next/server", () => {
  const responses: Array<{ data: unknown; init?: ResponseInit }> = [];
  return {
    NextRequest: class NextRequest {
      url: string;
      method: string;
      headers: Headers;
      private _body: string;
      constructor(url: string, init?: RequestInit) {
        this.url = url;
        this.method = init?.method ?? "GET";
        this.headers = new Headers(init?.headers as HeadersInit);
        this._body = typeof init?.body === "string" ? init.body : JSON.stringify(init?.body ?? {});
      }
      async json() {
        return JSON.parse(this._body);
      }
    },
    NextResponse: {
      json: (data: unknown, init?: ResponseInit) => {
        const entry = { data, init };
        responses.push(entry);
        const status = init?.status ?? 200;
        return {
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(data),
        };
      },
      __responses: responses,
    },
  };
});

jest.mock("@/lib/api-logger", () => ({ logApiError: jest.fn() }));
jest.mock("@/lib/api-auth", () => ({ requireAuth: jest.fn(() => null) }));
jest.mock("@/lib/audit-log", () => ({ appendAuditLine: jest.fn() }));

const mockCancelMission = jest.fn();
jest.mock("@/lib/backends", () => ({
  agentBackend: {
    cancelMission: (...args: unknown[]) => mockCancelMission(...args),
  },
}));

const mockGetMission = jest.fn();
const mockUpdateMission = jest.fn();

jest.mock("@/lib/mission-repository", () => ({
  getMission: (...args: unknown[]) => mockGetMission(...args),
  updateMission: (...args: unknown[]) => mockUpdateMission(...args),
  listMissions: jest.fn(),
  createMission: jest.fn(),
  deleteMission: jest.fn(),
  buildMissionPrompt: jest.fn(),
}));

const mockUpdateSession = jest.fn();
jest.mock("@/lib/session-repository", () => ({
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
}));

jest.mock("@/lib/mission-cron-sync", () => ({
  enrichMissionCron: jest.fn((m: unknown) => m),
  pauseMissionCron: jest.fn(),
  syncMissionToCronJob: jest.fn(),
  deleteMissionCron: jest.fn(),
}));

jest.mock("@/lib/cron-repository", () => ({
  createCronJob: jest.fn(),
  pushJobToHermes: jest.fn(),
}));

jest.mock("@/lib/mission-category-repository", () => ({
  getCategory: jest.fn(),
}));

jest.mock("@/lib/local-dir-entry", () => ({
  normalizeLocalDirsInput: jest.fn((d) => d ?? []),
}));

jest.mock("@/lib/profiles-repository", () => ({
  listProfiles: jest.fn(() => []),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCancelMission.mockResolvedValue({ processKilled: true, error: null });
});

describe("POST /api/missions cancel", () => {
  it("calls agentBackend.cancelMission for dispatched missions", async () => {
    mockGetMission.mockReturnValue({
      id: "m-1",
      status: "dispatched",
      sessionId: "sess-1",
    });
    mockUpdateMission.mockReturnValue({
      id: "m-1",
      status: "failed",
      result: "Cancelled by user",
      sessionId: "sess-1",
    });

    const { POST } = require("@/app/api/missions/route") as {
      POST: (req: unknown) => Promise<{ json: () => Promise<unknown> }>;
    };
    const { NextRequest } = require("next/server") as {
      NextRequest: new (url: string, init?: RequestInit) => unknown;
    };

    const req = new NextRequest("http://localhost/api/missions", {
      method: "POST",
      body: JSON.stringify({ action: "cancel", id: "m-1" }),
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      data?: { cancel?: { processKilled: boolean }; mission?: { id: string } };
    };

    expect(mockCancelMission).toHaveBeenCalledWith("m-1");
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({ status: "failed", error: "Cancelled by user" }),
    );
    expect(body.data?.cancel?.processKilled).toBe(true);
    expect(body.data?.mission?.id).toBe("m-1");
  });

  it("skips process kill for completed missions", async () => {
    mockGetMission.mockReturnValue({
      id: "m-2",
      status: "successful",
    });
    mockUpdateMission.mockReturnValue({
      id: "m-2",
      status: "failed",
      result: "Cancelled by user",
    });

    const { POST } = require("@/app/api/missions/route") as {
      POST: (req: unknown) => Promise<{ json: () => Promise<unknown> }>;
    };
    const { NextRequest } = require("next/server") as {
      NextRequest: new (url: string, init?: RequestInit) => unknown;
    };

    const req = new NextRequest("http://localhost/api/missions", {
      method: "POST",
      body: JSON.stringify({ action: "cancel", missionId: "m-2" }),
    });

    await POST(req);

    expect(mockCancelMission).not.toHaveBeenCalled();
  });
});
