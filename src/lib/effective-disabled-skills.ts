import { existsSync, readFileSync } from "fs";

import { getAgentRoot } from "./agent-root-repository";
import { getActiveHermesHome } from "./hermes-agent-runtime";
import {
  collectSkillDirectoryNames,
  computeEffectiveDisabledFromYaml,
  configPathForProfile,
  normalizeDisabledSkillKeys,
  skillsRootForProfile,
} from "./skills-config";
import { disabledSkillsFromJson } from "./profile-config-builder";
import { getDisabledSkills } from "./profiles-repository";
import { listSkills } from "./skills-repository";

/** Union of SQLite catalog keys and on-disk skill directory paths. */
export function listCatalogSkillKeys(): string[] {
  const keys = new Set<string>();
  for (const row of listSkills()) {
    keys.add(row.skillKey);
  }
  const home = getActiveHermesHome();
  for (const name of collectSkillDirectoryNames(skillsRootForProfile(home, "default"))) {
    keys.add(name);
  }
  return [...keys].sort();
}

/**
 * Resolve denylist for Skills UI: SQLite, normalized to catalog keys;
 * when empty or refreshFromDisk, merge from on-disk config.yaml.
 */
export function resolveEffectiveDisabledSkills(
  profile: string,
  options?: { refreshFromDisk?: boolean },
): Set<string> {
  const catalogKeys = listCatalogSkillKeys();
  const home = getActiveHermesHome();

  let fromDb: string[] =
    profile === "default"
      ? disabledSkillsFromJson(getAgentRoot().disabledSkillsJson)
      : getDisabledSkills(profile);

  const useDisk =
    options?.refreshFromDisk === true ||
    (fromDb.length === 0 && existsSync(configPathForProfile(home, profile)));

  if (useDisk) {
    const configPath = configPathForProfile(home, profile);
    if (existsSync(configPath)) {
      const yaml = readFileSync(configPath, "utf-8");
      fromDb = computeEffectiveDisabledFromYaml(yaml, catalogKeys);
    }
  }

  return new Set(normalizeDisabledSkillKeys(fromDb, catalogKeys));
}

export function catalogKeysForSkillsRoot(): string[] {
  const home = getActiveHermesHome();
  return collectSkillDirectoryNames(skillsRootForProfile(home, "default"));
}
