import { parseLogLine } from "@/lib/log-line-format";

describe("parseLogLine", () => {
  it("parses space-separated timestamp", () => {
    const p = parseLogLine("2026-05-10 12:00:00 INFO boot complete");
    expect(p.timestamp).toBe("2026-05-10 12:00:00");
    expect(p.level).toBe("info");
    expect(p.message).toContain("boot complete");
  });

  it("parses ISO prefix", () => {
    const p = parseLogLine("2026-05-10T12:00:00Z [ERROR] failed");
    expect(p.timestamp).toContain("2026-05-10");
    expect(p.level).toBe("error");
  });

  it("parses bracket level without timestamp", () => {
    const p = parseLogLine("[WARN] disk low");
    expect(p.timestamp).toBeNull();
    expect(p.level).toBe("warn");
    expect(p.message).toBe("disk low");
  });

  it("infers error from plain text", () => {
    const p = parseLogLine("Something Error occurred");
    expect(p.level).toBe("error");
    expect(p.message).toBe("Something Error occurred");
  });

  it("handles slash date format", () => {
    const p = parseLogLine("2026/05/10 08:30:00 startup");
    expect(p.timestamp).toBe("2026/05/10 08:30:00");
    expect(p.message).toBe("startup");
  });
});
