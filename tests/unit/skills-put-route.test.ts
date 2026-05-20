/** @jest-environment node */

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockStatSync = jest.fn(() => ({
  size: 12,
  mtime: new Date("2026-01-01T00:00:00Z"),
}));

jest.mock("fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  statSync: mockStatSync,
}));

jest.mock("@/lib/hermes-agent-runtime", () => ({
  getActiveHermesHome: jest.fn(() => "/tmp/test-hermes"),
}));

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
}));

jest.mock("@/lib/audit-log", () => ({
  appendAuditLine: jest.fn(),
}));

const mockRequireAuth = jest.fn(() => null);

jest.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockFindSkillFile = jest.fn();

jest.mock("@/lib/skills-enabled-config", () => ({
  findSkillFile: (...args: unknown[]) => mockFindSkillFile(...args),
}));

import { NextRequest, NextResponse } from "next/server";

describe("PUT /api/skills/[name]", () => {
  const skillPath = "/tmp/test-hermes/skills/demo/SKILL.md";

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockReturnValue(null);
    mockFindSkillFile.mockReturnValue(skillPath);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("original");
  });

  it("writes SKILL.md content when authenticated", async () => {
    const { PUT } = await import("@/app/api/skills/[name]/route");
    const req = new NextRequest("http://localhost/api/skills/demo?profile=default", {
      method: "PUT",
      body: JSON.stringify({ content: "updated skill body" }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req, { params: Promise.resolve({ name: "demo" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.content).toBe("updated skill body");
    expect(mockWriteFileSync).toHaveBeenCalledWith(skillPath, "updated skill body", "utf-8");
  });

  it("rejects when requireAuth returns a response", async () => {
    const readOnlyResponse = NextResponse.json({ error: "Read-only" }, { status: 403 });
    mockRequireAuth.mockReturnValue(readOnlyResponse);

    const { PUT } = await import("@/app/api/skills/[name]/route");
    const req = new NextRequest("http://localhost/api/skills/demo", {
      method: "PUT",
      body: JSON.stringify({ content: "x" }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req, { params: Promise.resolve({ name: "demo" }) });
    expect(res.status).toBe(403);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("returns 404 when skill file cannot be resolved", async () => {
    mockFindSkillFile.mockReturnValue(null);

    const { PUT } = await import("@/app/api/skills/[name]/route");
    const req = new NextRequest("http://localhost/api/skills/missing", {
      method: "PUT",
      body: JSON.stringify({ content: "x" }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req, { params: Promise.resolve({ name: "missing" }) });
    expect(res.status).toBe(404);
  });
});
