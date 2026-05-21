// ═══════════════════════════════════════════════════════════════
// profile-config-builder.ts — Merge DB fields ↔ Hermes config.yaml
// ═══════════════════════════════════════════════════════════════

import {
  buildDisabledYamlLines,
  parseSkillsDisabledFromYaml,
} from "./skills-config";
import { normalizePlatformToolsets } from "./hermes-toolset-normalize";

export type PlatformToolsets = Record<string, string[]>;

export interface ProfileConfigParts {
  personality: string;
  disabledSkills: string[];
  platformDisabledSkills: Record<string, string[]>;
  platformToolsets: PlatformToolsets;
  /** Preserved yaml body (keys outside agent/skills/platform_toolsets). */
  extraYamlLines: string[];
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function parseJsonToolsets(raw: string): PlatformToolsets {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: PlatformToolsets = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        out[k] = v.filter((x): x is string => typeof x === "string");
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeJsonArray(items: string[]): string {
  return JSON.stringify([...new Set(items)].sort());
}

export function serializeJsonToolsets(toolsets: PlatformToolsets): string {
  const sorted: PlatformToolsets = {};
  for (const key of Object.keys(toolsets).sort()) {
    sorted[key] = [...new Set(toolsets[key])].sort();
  }
  return JSON.stringify(sorted);
}

/** Extract managed sections from existing config.yaml text. */
export function parseConfigYaml(content: string): ProfileConfigParts {
  const lines = content.split(/\r?\n/);
  let personality = "technical";
  let inAgent = false;
  let inSkills = false;
  let skillsIndent = 0;
  const extraLines: string[] = [];
  const skillsParsed = parseSkillsDisabledFromYaml(content);
  const disabledSkills = [...skillsParsed.disabledNames].sort();
  const platformDisabledSkills: Record<string, string[]> = {};
  for (const [platform, values] of Object.entries(skillsParsed.platformDisabled)) {
    platformDisabledSkills[platform] = [...values].sort();
  }

  let inPlatformToolsets = false;
  let platformIndent = 0;
  const platformToolsets: PlatformToolsets = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("agent:")) {
      inAgent = true;
    }
    if (inAgent) {
      if (trimmed && !line.startsWith(" ") && !line.startsWith("\t")) {
        inAgent = false;
      } else if (trimmed.includes("personality:")) {
        personality =
          trimmed.split("personality:")[1]?.trim().replace(/['"]/g, "") || "technical";
        continue;
      }
    }

    if (trimmed.startsWith("skills:")) {
      inSkills = true;
      skillsIndent = line.search(/\S/);
      continue;
    }
    if (inSkills) {
      const indent = line.search(/\S/);
      if (trimmed && indent <= skillsIndent) {
        inSkills = false;
      }
      else {
        continue;
      }
    }

    if (trimmed.startsWith("platform_toolsets:")) {
      inPlatformToolsets = true;
      platformIndent = line.search(/\S/);
      continue;
    }
    if (inPlatformToolsets) {
      const indent = line.search(/\S/);
      if (trimmed && indent <= platformIndent && !trimmed.endsWith(":")) {
        inPlatformToolsets = false;
      } else {
        const platMatch = trimmed.match(/^([a-zA-Z0-9_-]+):\s*$/);
        if (platMatch) {
          const plat = platMatch[1];
          const tools: string[] = [];
          let j = i + 1;
          while (j < lines.length) {
            const row = lines[j];
            const t = row.trim();
            if (!t) {
              j++;
              continue;
            }
            if (row.search(/\S/) <= platformIndent && !t.startsWith("-")) break;
            const item = t.match(/^-\s*(.+)$/);
            if (item) tools.push(item[1].trim());
            j++;
          }
          platformToolsets[plat] = tools;
          i = j - 1;
          continue;
        }
      }
    }

    if (
      trimmed.startsWith("skills:") ||
      trimmed.startsWith("platform_toolsets:")
    ) {
      continue;
    }
    extraLines.push(line);
  }

  const extraYamlLines = stripLegacyToolsetsYaml(extraLines).filter((l, idx, arr) => {
      if (l.trim() !== "") return true;
      return idx > 0 && arr[idx - 1]?.trim() !== "";
    });

  return {
    personality,
    disabledSkills,
    platformDisabledSkills,
    platformToolsets,
    extraYamlLines,
  };
}

/** Remove deprecated top-level `toolsets:` blocks from preserved yaml. */
function stripLegacyToolsetsYaml(lines: string[]): string[] {
  const out: string[] = [];
  let skipping = false;
  let toolsetsIndent = -1;
  for (const line of lines) {
    const trimmed = line.trim();
    const indent = line.search(/\S/);
    if (trimmed === "toolsets:" || trimmed.startsWith("toolsets:")) {
      skipping = true;
      toolsetsIndent = indent;
      continue;
    }
    if (skipping) {
      if (!trimmed) continue;
      if (indent <= toolsetsIndent && !trimmed.startsWith("-")) {
        skipping = false;
      } else {
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

function buildPlatformToolsetsLines(toolsets: PlatformToolsets): string[] {
  const keys = Object.keys(toolsets).sort();
  if (keys.length === 0) return [];
  const lines = ["platform_toolsets:"];
  for (const plat of keys) {
    lines.push(`  ${plat}:`);
    for (const t of toolsets[plat]) {
      lines.push(`    - ${t}`);
    }
  }
  return lines;
}

/** Assemble full config.yaml from DB-backed parts. */
export function buildConfigYaml(parts: ProfileConfigParts): string {
  const lines: string[] = [];
  lines.push("skills:");
  lines.push(...buildDisabledYamlLines(parts.disabledSkills, parts.platformDisabledSkills));
  const pt = buildPlatformToolsetsLines(parts.platformToolsets);
  if (pt.length > 0) {
    lines.push(...pt);
  }
  if (parts.extraYamlLines.length > 0) {
    if (lines[lines.length - 1] !== "") lines.push("");
    lines.push(...parts.extraYamlLines);
  }
  return lines.join("\n") + "\n";
}

/** Update disabled list inside existing yaml while preserving other keys. */
export function patchDisabledSkillsInYaml(content: string, disabled: string[]): string {
  const parts = parseConfigYaml(content);
  parts.disabledSkills = [...disabled].sort();
  return buildConfigYaml(parts);
}

/** Pull: parse yaml into column-friendly values. */
export function configYamlToColumnValues(content: string): {
  personality: string;
  disabledSkillsJson: string;
  platformToolsetsJson: string;
  configYaml: string;
} {
  const parts = parseConfigYaml(content);
  const rebuilt = buildConfigYaml(parts);
  return {
    personality: parts.personality,
    disabledSkillsJson: serializeJsonArray(parts.disabledSkills),
    platformToolsetsJson: serializeJsonToolsets(parts.platformToolsets),
    configYaml: rebuilt,
  };
}

export function disabledSkillsFromJson(raw: string): string[] {
  return parseJsonArray(raw);
}

export function platformToolsetsFromJson(raw: string): PlatformToolsets {
  return parseJsonToolsets(raw);
}

/** Validate API/body input and return normalized platform toolsets. */
export function normalizePlatformToolsetsFromInput(raw: unknown): PlatformToolsets {
  if (raw === null || raw === undefined) {
    return {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("platformToolsets must be an object");
  }
  const out: PlatformToolsets = {};
  for (const [platform, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof platform !== "string" || !platform.trim()) continue;
    if (!Array.isArray(value)) continue;
    const list = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (list.length > 0) {
      out[platform] = list;
    }
  }
  return normalizePlatformToolsets(out);
}

export function isEmptyPlatformToolsets(toolsets: PlatformToolsets): boolean {
  return Object.keys(toolsets).length === 0;
}

export type PlatformToolsetsSource = "database" | "config_yaml" | "seed_pack";

/** Prefer SQLite JSON; fall back to parsed config.yaml, then seed pack on disk. */
export function resolvePlatformToolsets(
  platformToolsetsJson: string,
  configYaml: string,
  seedFallback?: PlatformToolsets,
): { toolsets: PlatformToolsets; source: PlatformToolsetsSource } {
  const fromDb = platformToolsetsFromJson(platformToolsetsJson);
  if (!isEmptyPlatformToolsets(fromDb)) {
    return { toolsets: fromDb, source: "database" };
  }

  const fromYaml = parseConfigYaml(configYaml).platformToolsets;
  if (!isEmptyPlatformToolsets(fromYaml)) {
    return { toolsets: fromYaml, source: "config_yaml" };
  }

  if (seedFallback && !isEmptyPlatformToolsets(seedFallback)) {
    return { toolsets: seedFallback, source: "seed_pack" };
  }

  return { toolsets: {}, source: "database" };
}

/** Compare disabled lists for drift (ignores yaml formatting). */
export function disabledSkillsMatchJson(yamlContent: string, disabledJson: string): boolean {
  const fromYaml = parseConfigYaml(yamlContent).disabledSkills;
  const fromDb = disabledSkillsFromJson(disabledJson);
  if (fromYaml.length !== fromDb.length) return false;
  const a = [...fromYaml].sort();
  const b = [...fromDb].sort();
  return a.every((v, i) => v === b[i]);
}
