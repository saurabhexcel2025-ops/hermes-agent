/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */

/**
 * PR 7 — built-in mission templates surface defaultModel + defaultProvider
 * via /api/templates so the missions form can auto-fill them.
 */

jest.mock("next/server", () => ({
  NextRequest: class NextRequest {
    url: string;
    constructor(url: string) {
      this.url = url;
    }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => {
      const status = init?.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
      };
    },
  },
}));

jest.mock("fs", () => ({
  existsSync: jest.fn(() => false),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(() => []),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.mock("@/lib/paths", () => ({
  PATHS: { templates: "/tmp/ch/templates" },
  CH_DATA_DIR: "/tmp/ch",
}));

describe("/api/templates GET — built-in template defaults", () => {
  it("includes defaultModel + defaultProvider for every TEMPLATE entry", async () => {
    const { GET } = require("@/app/api/templates/route") as typeof import("@/app/api/templates/route");
    const { TEMPLATES } = require("@/lib/mission-helpers") as typeof import("@/lib/mission-helpers");

    const res = await GET();
    const body = (await res.json()) as {
      data?: {
        templates: Array<{
          id: string;
          isCustom: boolean;
          defaultModel?: string;
          defaultProvider?: string;
        }>;
      };
    };

    const builtIns = body.data?.templates.filter((t) => !t.isCustom) ?? [];
    expect(builtIns.length).toBe(TEMPLATES.length);

    for (const t of builtIns) {
      const def = TEMPLATES.find((x) => x.id === t.id);
      expect(def).toBeDefined();
      expect(t.defaultModel).toBe(def!.defaultModel);
      expect(t.defaultProvider).toBe(def!.defaultProvider);
    }
  });

  it("every built-in template ships with both defaultModel and defaultProvider", async () => {
    const { TEMPLATES } = require("@/lib/mission-helpers") as typeof import("@/lib/mission-helpers");
    for (const t of TEMPLATES) {
      expect(t.defaultModel).toBeTruthy();
      expect(t.defaultProvider).toBeTruthy();
    }
  });
});
