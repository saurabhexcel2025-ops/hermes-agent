/** @jest-environment node */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

jest.mock("@/lib/api-logger", () => ({ logApiError: jest.fn() }));

jest.mock("@/lib/paths", () => ({
  PATHS: { missions: "/tmp/ch-data/missions" },
}));

jest.mock("fs", () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
}));

const mockListMissions = jest.fn();

jest.mock("@/lib/mission-repository", () => ({
  listMissions: () => mockListMissions(),
}));

jest.mock("@/lib/cron-repository", () => ({
  listCronJobs: jest.fn(() => []),
}));

jest.mock("@/lib/gateway-client", () => ({
  fetchGateway: jest.fn(async () => ({ ok: false })),
}));

describe("GET /api/missions/health", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListMissions.mockReturnValue([]);
  });

  it("returns healthy report with no missions", async () => {
    const { GET } = await import("@/app/api/missions/health/route");
    const res = await GET();
    const body = await res.json();
    expect(body.data.status).toBe("healthy");
    expect(body.data.missions.total).toBe(0);
    expect(body.data.gateway.running).toBe(false);
  });

  it("counts missions and marks degraded when stuck", async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockListMissions.mockReturnValue([
      {
        id: "m1",
        name: "Old",
        status: "queued",
        createdAt: old,
      },
    ]);

    const { GET } = await import("@/app/api/missions/health/route");
    const res = await GET();
    const body = await res.json();
    expect(body.data.missions.total).toBe(1);
    expect(body.data.missions.stuck.length).toBeGreaterThan(0);
    expect(["degraded", "critical"]).toContain(body.data.status);
  });
});
