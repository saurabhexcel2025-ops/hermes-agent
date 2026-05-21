/** @jest-environment node */

import {
  buildDisabledYamlLines,
  collectSkillDirectoryNames,
  parseSkillsDisabledFromYaml,
} from "@/lib/skills-config";

describe("parseSkillsDisabledFromYaml", () => {
  it("returns empty disabled lists when skills section has no disabled key", () => {
    const yaml = "version: 1\nskills:\n  other: true\n";
    const parsed = parseSkillsDisabledFromYaml(yaml);
    expect([...parsed.disabledNames]).toEqual([]);
  });

  it("returns empty disabled lists when there is no skills section", () => {
    const parsed = parseSkillsDisabledFromYaml("version: 1\n");
    expect([...parsed.disabledNames]).toEqual([]);
  });

  it("parses multiline disabled list", () => {
    const yaml = "skills:\n  disabled:\n    - foo\n    - bar\n";
    const parsed = parseSkillsDisabledFromYaml(yaml);
    expect(parsed.disabledNames.has("foo")).toBe(true);
    expect(parsed.disabledNames.has("bar")).toBe(true);
  });

  it("parses inline disabled and platform_disabled arrays", () => {
    const yaml = [
      "skills:",
      "  disabled: [a, b]",
      "  platform_disabled:",
      "    telegram: [c, d]",
    ].join("\n");
    const parsed = parseSkillsDisabledFromYaml(yaml);
    expect(parsed.disabledNames.has("a")).toBe(true);
    expect(parsed.disabledNames.has("b")).toBe(true);
    expect(parsed.platformDisabled.telegram.has("c")).toBe(true);
    expect(parsed.platformDisabled.telegram.has("d")).toBe(true);
  });
});

describe("buildDisabledYamlLines", () => {
  it("emits empty disabled list", () => {
    expect(buildDisabledYamlLines([])).toEqual(["  disabled: []"]);
  });

  it("emits platform_disabled", () => {
    expect(buildDisabledYamlLines(["a"], { cli: ["b"] })).toEqual([
      "  disabled:",
      "    - a",
      "  platform_disabled:",
      "    cli:",
      "      - b",
    ]);
  });
});

describe("collectSkillDirectoryNames", () => {
  it("returns an empty list for a missing skills root", () => {
    expect(collectSkillDirectoryNames("/nonexistent-skills-root")).toEqual([]);
  });
});
