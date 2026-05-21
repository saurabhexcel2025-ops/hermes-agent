/** @jest-environment node */

import {
  buildConfigYaml,
  configYamlToColumnValues,
  disabledSkillsFromJson,
  parseConfigYaml,
  resolvePlatformToolsets,
} from "@/lib/profile-config-builder";

describe("profile-config-builder", () => {
  it("round-trips disabled skills and toolsets", () => {
    const yaml = buildConfigYaml({
      personality: "technical",
      disabledSkills: ["creative/image-gen", "gaming/steam"],
      platformDisabledSkills: { telegram: ["devops/terminal"] },
      platformToolsets: { cli: ["terminal", "file"] },
      extraYamlLines: ["agent:", "  max_turns: 40", "version: 2"],
    });
    const parts = parseConfigYaml(yaml);
    expect(parts.personality).toBe("technical");
    expect(parts.disabledSkills).toEqual(["creative/image-gen", "gaming/steam"]);
    expect(parts.platformDisabledSkills.telegram).toEqual(["devops/terminal"]);
    expect(parts.platformToolsets.cli).toEqual(["terminal", "file"]);
    expect(parts.extraYamlLines).toContain("version: 2");

    const cols = configYamlToColumnValues(yaml);
    expect(disabledSkillsFromJson(cols.disabledSkillsJson)).toEqual([
      "creative/image-gen",
      "gaming/steam",
    ]);
  });

  it("preserves extra yaml when rebuilding config", () => {
    const input = [
      "version: 9",
      "agent:",
      "  personality: creative",
      "  max_turns: 30",
      "skills:",
      "  disabled:",
      "    - skill-a",
    ].join("\n");
    const parts = parseConfigYaml(input);
    const rebuilt = buildConfigYaml({
      personality: parts.personality,
      disabledSkills: parts.disabledSkills,
      platformDisabledSkills: parts.platformDisabledSkills,
      platformToolsets: parts.platformToolsets,
      extraYamlLines: parts.extraYamlLines,
    });
    expect(rebuilt).toContain("version: 9");
    expect(rebuilt).toContain("max_turns: 30");
    expect(rebuilt).toContain("skill-a");
  });

  it("resolvePlatformToolsets prefers database json over yaml", () => {
    const yaml = buildConfigYaml({
      personality: "technical",
      disabledSkills: [],
      platformDisabledSkills: {},
      platformToolsets: { cli: ["terminal"] },
      extraYamlLines: [],
    });
    const resolved = resolvePlatformToolsets(
      JSON.stringify({ cli: ["hermes-cli"] }),
      yaml,
    );
    expect(resolved.source).toBe("database");
    expect(resolved.toolsets.cli).toEqual(["hermes-cli"]);
  });

  it("resolvePlatformToolsets falls back to config yaml when json empty", () => {
    const yaml = buildConfigYaml({
      personality: "technical",
      disabledSkills: [],
      platformDisabledSkills: {},
      platformToolsets: { discord: ["hermes-discord"] },
      extraYamlLines: [],
    });
    const resolved = resolvePlatformToolsets("{}", yaml);
    expect(resolved.source).toBe("config_yaml");
    expect(resolved.toolsets.discord).toEqual(["hermes-discord"]);
  });
});

describe("buildMissionPrompt toolsets", () => {
  it("includes recommended_toolsets when provided", async () => {
    const { buildMissionPrompt } = await import("@/lib/build-mission-prompt");
    const prompt = buildMissionPrompt({
      instruction: "Run checks",
      toolsets: ["terminal", "file"],
    });
    expect(prompt).toContain("<recommended_toolsets>");
    expect(prompt).toContain("terminal");
  });
});
