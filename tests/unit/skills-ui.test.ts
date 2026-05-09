import {
  effectiveSkillEnabled,
  matchesSkillTab,
} from "@/lib/skills-ui";

describe("skills-ui", () => {
  const skill = (name: string, enabled: boolean) => ({ name, enabled });

  describe("effectiveSkillEnabled", () => {
    it("uses server flag when no pending entry", () => {
      expect(effectiveSkillEnabled(skill("a", true), {})).toBe(true);
      expect(effectiveSkillEnabled(skill("a", false), {})).toBe(false);
    });

    it("prefers pending over server flag", () => {
      expect(effectiveSkillEnabled(skill("a", false), { a: true })).toBe(true);
      expect(effectiveSkillEnabled(skill("a", true), { a: false })).toBe(false);
    });
  });

  describe("matchesSkillTab", () => {
    it("all includes every skill regardless of pending", () => {
      expect(matchesSkillTab("all", skill("x", false), { x: true })).toBe(true);
      expect(matchesSkillTab("all", skill("x", true), { x: false })).toBe(true);
    });

    it("enabled uses effective on state", () => {
      expect(matchesSkillTab("enabled", skill("x", true), {})).toBe(true);
      expect(matchesSkillTab("enabled", skill("x", false), {})).toBe(false);
      expect(matchesSkillTab("enabled", skill("x", false), { x: true })).toBe(
        true,
      );
      expect(matchesSkillTab("enabled", skill("x", true), { x: false })).toBe(
        false,
      );
    });

    it("disabled uses effective off state", () => {
      expect(matchesSkillTab("disabled", skill("x", false), {})).toBe(true);
      expect(matchesSkillTab("disabled", skill("x", true), {})).toBe(false);
      expect(matchesSkillTab("disabled", skill("x", false), { x: true })).toBe(
        false,
      );
      expect(matchesSkillTab("disabled", skill("x", true), { x: false })).toBe(
        true,
      );
    });
  });
});
