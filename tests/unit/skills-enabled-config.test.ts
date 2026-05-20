/** @jest-environment node */

import {
  buildEnabledYamlLines,
  findSkillsEnabledBlockLineRange,
  findSkillsHeaderLineIndex,
  getResolvedEnabledSkillNames,
  parseSkillsEnabledFromYaml,
} from "@/lib/skills-enabled-config";

describe("parseSkillsEnabledFromYaml", () => {
  it("returns inherit_all when skills section has no enabled key", () => {
    const yaml = "version: 1\nskills:\n  other: true\n";
    expect(parseSkillsEnabledFromYaml(yaml)).toEqual({ mode: "inherit_all" });
  });

  it("returns inherit_all when there is no skills section", () => {
    expect(parseSkillsEnabledFromYaml("version: 1\n")).toEqual({
      mode: "inherit_all",
    });
  });

  it("treats explicit enabled: [] as explicit empty allowlist", () => {
    const yaml = "skills:\n  enabled: []\n";
    const r = parseSkillsEnabledFromYaml(yaml);
    expect(r.mode).toBe("explicit");
    if (r.mode === "explicit") expect(r.enabledNames.size).toBe(0);
  });

  it("parses multiline enabled list", () => {
    const yaml = "skills:\n  enabled:\n    - foo\n    - bar\n";
    const r = parseSkillsEnabledFromYaml(yaml);
    expect(r.mode).toBe("explicit");
    if (r.mode === "explicit") {
      expect(r.enabledNames.has("foo")).toBe(true);
      expect(r.enabledNames.has("bar")).toBe(true);
    }
  });

  it("parses inline enabled array", () => {
    const yaml = "skills:\n  enabled: [a, b]\n";
    const r = parseSkillsEnabledFromYaml(yaml);
    expect(r.mode).toBe("explicit");
    if (r.mode === "explicit") {
      expect(r.enabledNames.has("a")).toBe(true);
      expect(r.enabledNames.has("b")).toBe(true);
    }
  });
});

describe("buildEnabledYamlLines / findSkillsEnabledBlockLineRange", () => {
  it("finds single-line enabled: [] block", () => {
    const lines = ["skills:", "  enabled: []", "agent:"];
    const r = findSkillsEnabledBlockLineRange(lines);
    expect(r).toEqual({ start: 1, endExclusive: 2 });
    expect(buildEnabledYamlLines([])).toEqual(["  enabled: []"]);
  });

  it("findSkillsHeaderLineIndex locates skills:", () => {
    const lines = ["version: 1", "skills:", "  foo: bar"];
    expect(findSkillsHeaderLineIndex(lines)).toBe(1);
  });
});

describe("getResolvedEnabledSkillNames", () => {
  it("uses inherit_all as full disk list when no enabled key", () => {
    const yaml = "skills:\n";
    expect(
      getResolvedEnabledSkillNames(yaml, "/nonexistent-skills-root")
    ).toEqual([]);
  });

  it("uses explicit set when enabled present", () => {
    const yaml = "skills:\n  enabled:\n    - only-one\n";
    expect(
      getResolvedEnabledSkillNames(yaml, "/nonexistent-skills-root").sort()
    ).toEqual(["only-one"]);
  });
});
