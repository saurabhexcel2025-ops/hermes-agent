// ═══════════════════════════════════════════════════════════════
// PR 6 — sidebar config: Models link
// ═══════════════════════════════════════════════════════════════
// Asserts:
//   - the legacy `Model` link (label `Model`, href `/config/model`) is gone
//   - the new `Models` link (label `Models`, href `/config/models`) lives
//     in the Core config group
//   - the e2e nav matrix points at `/config/models`, not the legacy path

import { configGroups } from "@/components/layout/sidebar-config";
import { APP_NAV_ROUTES } from "../e2e/app-routes";

describe("sidebar-config Models link", () => {
  const allLinks = configGroups.flatMap((g) => g.links);

  it("does not include the legacy /config/model link", () => {
    expect(allLinks.some((l) => l.href === "/config/model")).toBe(false);
    expect(allLinks.some((l) => l.label === "Model")).toBe(false);
  });

  it("includes a Models link pointing at /config/models in the Core group", () => {
    const core = configGroups.find((g) => g.label === "Core");
    expect(core).toBeDefined();
    const link = core!.links.find((l) => l.href === "/config/models");
    expect(link).toBeDefined();
    expect(link!.label).toBe("Models");
    expect(link!.color).toBe("purple");
  });

  it("e2e nav matrix tracks the new path, not the legacy one", () => {
    expect(APP_NAV_ROUTES).toContain("/config/models");
    expect(APP_NAV_ROUTES).not.toContain("/config/model");
  });
});
