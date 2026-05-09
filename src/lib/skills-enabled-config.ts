import { existsSync, readdirSync } from "fs";

/**
 * How Hermes profile config treats skills.enabled for Control Hub.
 *
 * - **inherit_all** — no `enabled:` key under `skills:` → all installed skills count as enabled
 *   (backward-compatible with configs that never adopted allowlists).
 * - **explicit** — `enabled:` is present (including `enabled: []`) → only listed names are enabled.
 */
export type ParsedSkillsEnabled =
  | { mode: "inherit_all" }
  | { mode: "explicit"; enabledNames: Set<string> };

/**
 * Walk `skillsRoot` for directories that contain SKILL.md (leaf skill ids).
 */
export function collectSkillDirectoryNames(skillsRoot: string): string[] {
  const names: string[] = [];
  if (!existsSync(skillsRoot)) return names;

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = dir + "/" + entry.name;
      if (!entry.isDirectory()) continue;
      if (existsSync(full + "/SKILL.md")) {
        names.push(entry.name);
      } else {
        walk(full);
      }
    }
  };

  walk(skillsRoot);
  return [...new Set(names)].sort();
}

/**
 * Parse `skills.enabled` from Hermes-style YAML text (line-oriented, tolerant).
 */
export function parseSkillsEnabledFromYaml(content: string): ParsedSkillsEnabled {
  const lines = content.split(/\r?\n/);

  let skillsLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trimStart();
    if (t.startsWith("skills:")) {
      skillsLine = i;
      break;
    }
  }
  if (skillsLine === -1) return { mode: "inherit_all" };

  let sectionEnd = lines.length;
  for (let j = skillsLine + 1; j < lines.length; j++) {
    const raw = lines[j];
    if (raw.trim() !== "" && !raw.startsWith(" ") && !raw.startsWith("\t")) {
      sectionEnd = j;
      break;
    }
  }

  for (let i = skillsLine + 1; i < sectionEnd; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("enabled:")) continue;

    const afterColon = trimmed.slice("enabled:".length).trim();
    const enabledNames = new Set<string>();

    if (afterColon === "[]") {
      return { mode: "explicit", enabledNames };
    }

    if (afterColon.startsWith("[") && afterColon.endsWith("]")) {
      const inner = afterColon.slice(1, -1).trim();
      if (!inner) return { mode: "explicit", enabledNames };
      for (const part of inner.split(",")) {
        const p = part.trim().replace(/^["']|["']$/g, "");
        if (p) enabledNames.add(p);
      }
      return { mode: "explicit", enabledNames };
    }

    if (afterColon !== "") {
      enabledNames.add(afterColon.replace(/^["']|["']$/g, ""));
      return { mode: "explicit", enabledNames };
    }

    let j = i + 1;
    while (j < sectionEnd) {
      const row = lines[j];
      const t = row.trim();
      if (t.startsWith("#")) {
        j++;
        continue;
      }
      const m = t.match(/^-\s*(.+)$/);
      if (m) {
        enabledNames.add(m[1].trim());
        j++;
        continue;
      }
      if (t === "") {
        j++;
        continue;
      }
      const siblingUnderSkills =
        /^\s{2}[a-zA-Z0-9_-]+:/.test(row) && !/^\s{4}/.test(row);
      if (siblingUnderSkills) break;
      break;
    }
    return { mode: "explicit", enabledNames };
  }

  return { mode: "inherit_all" };
}

/**
 * Current enabled skill ids as Hermes would apply for toggling (sorted).
 */
export function getResolvedEnabledSkillNames(
  content: string,
  skillsRoot: string
): string[] {
  const parsed = parseSkillsEnabledFromYaml(content);
  if (parsed.mode === "inherit_all") {
    return collectSkillDirectoryNames(skillsRoot);
  }
  return [...parsed.enabledNames].sort();
}

/** YAML lines for `skills.enabled` (two-space indent under `skills:`). */
export function buildEnabledYamlLines(enabledSorted: string[]): string[] {
  if (enabledSorted.length === 0) return ["  enabled: []"];
  return ["  enabled:", ...enabledSorted.map((s) => "    - " + s)];
}

export interface EnabledBlockRange {
  start: number;
  endExclusive: number;
}

/**
 * Line range [start, endExclusive) of the `enabled:` entry under the first `skills:` block.
 * `null` if there is no `enabled:` key yet (caller may insert).
 */
export function findSkillsEnabledBlockLineRange(
  lines: string[]
): EnabledBlockRange | null {
  let skillsLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith("skills:")) {
      skillsLine = i;
      break;
    }
  }
  if (skillsLine === -1) return null;

  let sectionEnd = lines.length;
  for (let j = skillsLine + 1; j < lines.length; j++) {
    const raw = lines[j];
    if (raw.trim() !== "" && !raw.startsWith(" ") && !raw.startsWith("\t")) {
      sectionEnd = j;
      break;
    }
  }

  for (let i = skillsLine + 1; i < sectionEnd; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("enabled:")) continue;

    const start = i;
    const afterColon = trimmed.slice("enabled:".length).trim();

    if (afterColon === "[]") {
      return { start, endExclusive: start + 1 };
    }
    if (afterColon.startsWith("[") && afterColon.endsWith("]")) {
      return { start, endExclusive: start + 1 };
    }
    if (afterColon !== "") {
      return { start, endExclusive: start + 1 };
    }

    let j = i + 1;
    while (j < sectionEnd) {
      const row = lines[j];
      const t = row.trim();
      if (t.startsWith("#")) {
        j++;
        continue;
      }
      if (t.match(/^-\s*.+/)) {
        j++;
        continue;
      }
      if (t === "") {
        j++;
        continue;
      }
      const siblingUnderSkills =
        /^\s{2}[a-zA-Z0-9_-]+:/.test(row) && !/^\s{4}/.test(row);
      if (siblingUnderSkills) break;
      break;
    }
    return { start, endExclusive: j };
  }

  return null;
}

/** First `skills:` line index, or -1. */
export function findSkillsHeaderLineIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith("skills:")) return i;
  }
  return -1;
}
