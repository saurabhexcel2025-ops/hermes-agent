/** @jest-environment node */

jest.mock("child_process", () => ({
  execSync: jest.fn(() => "0\n"),
}));

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockReaddirSync = jest.fn();

jest.mock("fs", () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  readdirSync: (...a: unknown[]) => mockReaddirSync(...a),
}));

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
}));

jest.mock("@/lib/hermes-agent-runtime", () => ({
  getActiveHermesPaths: () => ({
    cronJobs: "/tmp/hermes/cron/jobs.json",
  }),
}));

jest.mock("@/lib/paths", () => ({
  PATHS: {
    missions: "/tmp/ch-data/missions",
  },
}));

describe("GET /api/missions/health", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it("returns healthy report with empty dirs", async () => {
    const { GET } = await import("@/app/api/missions/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("healthy");
    expect(body.data.missions.total).toBe(0);
    expect(body.data.gateway.running).toBe(false);
  });

  it("counts missions and marks degraded when stuck", async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (String(p).includes("missions")) return true;
      if (String(p).includes("jobs.json")) return false;
      return false;
    });
    mockReaddirSync.mockReturnValue(["m1.json"]);
    const old = Date.now() - 60 * 60 * 1000;
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        id: "m1",
        name: "Old",
        createdAt: new Date(old).toISOString(),
        status: "queued",
      })
    );

    const { GET } = await import("@/app/api/missions/health/route");
    const res = await GET();
    const body = await res.json();
    expect(body.data.missions.total).toBe(1);
    expect(body.data.missions.stuck.length).toBeGreaterThan(0);
    // Stuck missions force degraded; active + no gateway can elevate to critical per route logic.
    expect(["degraded", "critical"]).toContain(body.data.status);
  });
});
