// Mirrors Sidebar `sanitizeDeployBranchClient` — keep rules aligned with POST /api/update sanitization.

function sanitizeDeployBranchClient(raw: string): string {
  const s = raw.replace(/[^a-zA-Z0-9._/-]/g, "").slice(0, 200);
  return s || "dev";
}

describe("deploy branch client sanitization", () => {
  it("strips unsafe characters", () => {
    expect(sanitizeDeployBranchClient("feat;rm")).toBe("featrm");
  });

  it("truncates length", () => {
    const long = "a".repeat(300);
    expect(sanitizeDeployBranchClient(long).length).toBe(200);
  });

  it("falls back to dev when empty after strip", () => {
    expect(sanitizeDeployBranchClient(";;;")).toBe("dev");
  });
});
