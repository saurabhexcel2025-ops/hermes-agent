/**
 * Pure helpers for Skills Manager UI (filter tabs vs persisted + pending state).
 */

export type SkillFilterTab = "all" | "enabled" | "disabled";

export interface SkillLike {
  name: string;
  enabled: boolean;
}

/**
 * Effective enabled flag after applying optimistic pending toggles.
 */
export function effectiveSkillEnabled(
  skill: SkillLike,
  pendingToggles: Record<string, boolean>,
): boolean {
  if (skill.name in pendingToggles) return pendingToggles[skill.name];
  return skill.enabled;
}

/**
 * Whether a skill row should appear under the All / Enabled / Disabled tab.
 */
export function matchesSkillTab(
  filter: SkillFilterTab,
  skill: SkillLike,
  pendingToggles: Record<string, boolean>,
): boolean {
  if (filter === "all") return true;
  const on = effectiveSkillEnabled(skill, pendingToggles);
  if (filter === "enabled") return on;
  return !on;
}
