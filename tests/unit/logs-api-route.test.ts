/** @jest-environment node */

jest.mock("@/lib/hermes-agent-runtime", () => ({
  getActiveHermesPaths: () => ({ logs: "/tmp/hermes-logs-test" }),
}));

jest.mock("@/lib/api-auth", () => ({
  requireMcApiKey: () => null,
  requireNotReadOnly: () => null,
}));

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockStatSync = jest.fn();
const mockWriteFileSync = jest.fn();

jest.mock("fs", () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  readdirSync: (...a: unknown[]) => mockReaddirSync(...a),
  statSync: (...a: unknown[]) => mockStatSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
}));

describe("GET /api/logs sanitisation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatSync.mockReturnValue({ size: 10, mtime: new Date("2026-01-02") });
    mockReadFileSync.mockReturnValue("line\n");
  });

  it("returns 400 for invalid name query characters", async () => {
    mockExistsSync.mockImplementation((p: string) => {
      const s = String(p).replace(/\\/g, "/");
      if (s.endsWith("hermes-logs-test")) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue(["agent.log"]);

    const { GET } = await import("@/app/api/logs/route");
    const res = await GET(
      new Request("http://localhost/api/logs?name=a%3Bb&lines=50"),
    );
    expect(res.status).toBe(400);
  });

  it("lists ch-health style names in availableLogs", async () => {
    mockExistsSync.mockImplementation((p: string) => {
      const s = String(p).replace(/\\/g, "/");
      if (s.endsWith("hermes-logs-test")) return true;
      if (s.endsWith("agent.log")) return true;
      if (s.endsWith("ch-health.log")) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue(["agent.log", "ch-health.log"]);
    mockReadFileSync.mockReturnValue("ok\n");

    const { GET } = await import("@/app/api/logs/route");
    const res = await GET(new Request("http://localhost/api/logs?name=agent"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.data.availableLogs.map((x: { name: string }) => x.name);
    expect(names).toContain("agent");
    expect(names).toContain("ch-health");
    const ch = body.data.availableLogs.find((x: { name: string }) => x.name === "ch-health");
    expect(ch.group).toBe("hardware");
  });
});
