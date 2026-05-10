/**
 * Asserts every built-in mission template now ships with a defaultModel
 * + defaultProvider, and that the v1 template-pack schema accepts a
 * template entry where these fields are optional or set.
 */

import { TEMPLATES } from "@/lib/mission-helpers";
import {
  templatePackEntrySchema,
  parseTemplatePackManifestV1,
  TEMPLATE_PACK_SCHEMA_VERSION,
} from "@/lib/schema/template-pack-v1";
import { isHermesProvider } from "@/lib/hermes-providers";

describe("template defaults", () => {
  it("every built-in template defines defaultModel and defaultProvider", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(9);
    for (const t of TEMPLATES) {
      expect(typeof t.defaultModel).toBe("string");
      expect(t.defaultModel?.length).toBeGreaterThan(0);
      expect(typeof t.defaultProvider).toBe("string");
      expect(t.defaultProvider?.length).toBeGreaterThan(0);
      expect(isHermesProvider(t.defaultProvider)).toBe(true);
    }
  });
});

describe("template-pack-v1 schema", () => {
  it("defaultModel and defaultProvider are optional on entries", () => {
    const entry = {
      id: "no-model",
      name: "Bare",
      icon: "Bug",
      color: "cyan" as const,
      category: "x",
      profile: "y",
      description: "",
      prompt: "do a thing",
      goals: [],
      suggestedSkills: [],
      timeoutMinutes: 30,
    };
    const r = templatePackEntrySchema.safeParse(entry);
    expect(r.success).toBe(true);
  });

  it("accepts entries with defaultModel + defaultProvider", () => {
    const entry = {
      id: "with-model",
      name: "Set",
      icon: "Bug",
      color: "cyan" as const,
      category: "x",
      profile: "y",
      description: "",
      prompt: "do a thing",
      goals: [],
      suggestedSkills: [],
      defaultModel: "anthropic/claude-sonnet-4",
      defaultProvider: "anthropic",
      timeoutMinutes: 30,
    };
    const r = templatePackEntrySchema.safeParse(entry);
    expect(r.success).toBe(true);
  });

  it("parseTemplatePackManifestV1 round-trips a built-in template through the schema", () => {
    const sample = TEMPLATES[0];
    const manifest = {
      schemaVersion: TEMPLATE_PACK_SCHEMA_VERSION,
      id: "builtin-test-pack",
      name: "Test pack",
      version: "0.0.1",
      templates: [
        {
          id: sample.id,
          name: sample.name,
          icon: sample.icon,
          color: sample.color,
          category: sample.category,
          profile: sample.profile,
          description: sample.description,
          prompt: sample.instruction,
          goals: sample.goals,
          suggestedSkills: sample.suggestedSkills,
          defaultModel: sample.defaultModel,
          defaultProvider: sample.defaultProvider,
          timeoutMinutes: 30,
        },
      ],
    };
    const result = parseTemplatePackManifestV1(manifest);
    expect(result.ok).toBe(true);
  });
});
