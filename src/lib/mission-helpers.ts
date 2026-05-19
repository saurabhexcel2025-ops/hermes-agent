// ═══════════════════════════════════════════════════════════════
// Control Hub - Mission template definitions
// Only TEMPLATES and TemplateDef are used (by templates/route.ts).
// ═══════════════════════════════════════════════════════════════

// ── Template definition (prompt-building blocks) ───────────────

export interface TemplateDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  category: string;
  profile: string;
  description: string;
  instruction: string;
  context: string;
  goals: string[];
  suggestedSkills: string[];
  /**
   * Hermes model id hint for the mission form. Omit or use a blank string
   * to fall through to the registry agent default. User can override per-mission.
   */
  defaultModel?: string;
  /**
   * Inference provider that pairs with `defaultModel`. Must match a
   * provider id in src/lib/hermes-providers.ts.
   */
  defaultProvider?: string;
}

// ── Template Definitions ─────────────────────────────────────
//
// Minimal templates — the agent's personality and approach come from its
// Hermes profile (SOUL.md + AGENTS.md), not from a rigid workflow script.
// Each template is: a role, one sentence of instruction, and optional skills.
// The dispatch prompt builder (buildMissionPrompt) wraps these with goals,
// scope, and safety headers before sending to the agent.
// ═══════════════════════════════════════════════════════════════

/** Built-in templates are loaded from SQLite catalog_templates (see seed-catalog). */
export const TEMPLATES: TemplateDef[] = [];
