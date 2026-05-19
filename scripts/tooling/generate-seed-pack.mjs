#!/usr/bin/env node
/**
 * One-shot generator for data/seed/ (profiles + template pack).
 * Run: node scripts/tooling/generate-seed-pack.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const SEED_ROOT = join(ROOT, "data", "seed");
const PROFILES_ROOT = join(SEED_ROOT, "profiles");
const BUNDLED = join(ROOT, "scripts", "bundled-profiles");

const MANIFEST = {
  version: "1.0.0",
  profiles: [
    {
      slug: "qa",
      displayName: "QA",
      description: "Quality assurance, reproduction, and test-driven fixes",
      personality: "technical",
      seedKey: "ch.prof.qa",
    },
    {
      slug: "swe",
      displayName: "SWE",
      description: "Software engineering, features, and refactors",
      personality: "technical",
      seedKey: "ch.prof.swe",
    },
    {
      slug: "devops",
      displayName: "DevOps",
      description: "CI/CD, infrastructure, deploy and verify",
      personality: "technical",
      seedKey: "ch.prof.devops",
    },
    {
      slug: "data-scientist",
      displayName: "Data Scientist",
      description: "Analysis, forecasting, and reproducible data pipelines",
      personality: "technical",
      seedKey: "ch.prof.data-scientist",
    },
    {
      slug: "creative-lead",
      displayName: "Creative Lead",
      description: "Content, UX copy, and narrative quality",
      personality: "creative",
      seedKey: "ch.prof.creative-lead",
    },
    {
      slug: "support",
      displayName: "Support",
      description: "Triage, customer impact, and clear operator guidance",
      personality: "friendly",
      seedKey: "ch.prof.support",
    },
  ],
};

const LEGACY_MAP = {
  qa: "qa-engineer",
  swe: "swe-engineer",
  devops: "devops-engineer",
};

function agentsHeader(slug) {
  const titles = {
    qa: "QA — Development Guide",
    swe: "SWE — Development Guide",
    devops: "DevOps — Development Guide",
    "data-scientist": "Data Scientist — Development Guide",
    "creative-lead": "Creative Lead — Development Guide",
    support: "Support — Development Guide",
  };
  return `# ${titles[slug]}\n§\n`;
}

function soulExtra(slug) {
  if (slug === "qa") {
    return "\n§\nYou are a quality assurance specialist focused on reproduction, regression prevention, and evidence-based fixes.\n";
  }
  return "";
}

function defaultConfig(personality) {
  return `agent:\n  personality: ${personality}\nskills:\n  enabled: []\n`;
}

function writeProfile(slug, personality, legacyDir) {
  const dir = join(PROFILES_ROOT, slug);
  mkdirSync(dir, { recursive: true });

  let soul = "";
  let agents = "";
  if (legacyDir && existsSync(join(BUNDLED, legacyDir, "SOUL.md"))) {
    soul = readFileSync(join(BUNDLED, legacyDir, "SOUL.md"), "utf-8");
    agents = readFileSync(join(BUNDLED, legacyDir, "AGENTS.md"), "utf-8");
    agents = agents.replace(/^#[^\n]+\n/, agentsHeader(slug));
  } else {
    soul = `You are a subject matter expert for the ${slug} role.\n`;
    agents =
      agentsHeader(slug) +
      `You operate within the Control Hub and Hermes ecosystem.\n§\nFollow project conventions and document outcomes clearly.\n`;
  }
  soul += soulExtra(slug);

  writeFileSync(join(dir, "SOUL.md"), soul, "utf-8");
  writeFileSync(join(dir, "AGENTS.md"), agents, "utf-8");
  writeFileSync(join(dir, "config.yaml"), defaultConfig(personality), "utf-8");
}

function template(
  id,
  name,
  icon,
  color,
  categoryId,
  profile,
  description,
  instruction,
) {
  return {
    id,
    seedKey: `ch.tpl.${id}`,
    name,
    icon,
    color,
    categoryId,
    profile,
    description,
    instruction,
    context:
      "## Input\n\n(Describe the task.)\n\n## Scope\n\n- In scope: as described\n- Out of scope: unrelated refactors\n",
    goals: ["Deliver the outcome described in the instruction", "Document assumptions and verification steps"],
    outputFormat:
      "Structured markdown: Summary, Changes, Verification, Follow-ups (if any).",
    constraints:
      "Do not bypass Control Hub APIs for state changes. Run tests/build when touching application code.",
    suggestedSkills: [],
    localDirs: [],
    references: [],
    missionTimeMinutes: 60,
    timeoutMinutes: 120,
  };
}

const templates = [
  template(
    "general-task",
    "General Task",
    "Target",
    "cyan",
    "general",
    "default",
    "Flexible task with clear outcomes",
    "Complete the task described below using the project's conventions and tooling.",
  ),
  template(
    "bug-hunt",
    "Bug Hunt",
    "Bug",
    "pink",
    "quality",
    "qa",
    "Find, reproduce, and fix a defect",
    "Reproduce the reported issue, identify root cause, implement a minimal fix, and add regression coverage.",
  ),
  template(
    "feature-build",
    "Feature Build",
    "Hammer",
    "purple",
    "engineering",
    "swe",
    "Implement a scoped feature",
    "Design and implement the feature with tests and documentation aligned to existing patterns.",
  ),
  template(
    "code-review",
    "Code Review",
    "Search",
    "purple",
    "engineering",
    "swe",
    "Review changes for quality and risk",
    "Review the diff for correctness, security, performance, and maintainability. List actionable findings.",
  ),
  template(
    "deploy-verify",
    "Deploy & Verify",
    "Rocket",
    "orange",
    "operations",
    "devops",
    "Deploy and confirm health",
    "Execute the deployment steps, run smoke checks, and report status with rollback notes if needed.",
  ),
  template(
    "infra-audit",
    "Infrastructure Audit",
    "Server",
    "orange",
    "operations",
    "devops",
    "Audit infrastructure configuration",
    "Review CI/CD, secrets handling, and runtime configuration. Propose safe improvements.",
  ),
  template(
    "data-analysis",
    "Data Analysis",
    "BarChart",
    "green",
    "data",
    "data-scientist",
    "Analyse data and report findings",
    "Explore the dataset, validate quality, produce reproducible analysis and clear recommendations.",
  ),
  template(
    "research-brief",
    "Research Brief",
    "BookOpen",
    "blue",
    "research",
    "default",
    "Research and summarise",
    "Gather sources, compare options, and deliver a concise brief with citations or links.",
  ),
  template(
    "content-draft",
    "Content Draft",
    "PenLine",
    "purple",
    "creative",
    "creative-lead",
    "Draft user-facing content",
    "Produce clear, on-brand copy with structure suitable for the target surface.",
  ),
  template(
    "regression-suite",
    "Regression Suite",
    "ListChecks",
    "pink",
    "quality",
    "qa",
    "Expand or run regression coverage",
    "Identify gaps in test coverage for the affected area and add or run tests to prevent recurrence.",
  ),
  template(
    "support-triage",
    "Support Triage",
    "LifeBuoy",
    "cyan",
    "general",
    "support",
    "Triage an operator or user issue",
    "Classify severity, identify likely cause, and provide step-by-step resolution or escalation.",
  ),
  template(
    "maintenance-sweep",
    "Maintenance Sweep",
    "Wrench",
    "orange",
    "maintenance",
    "default",
    "Routine maintenance pass",
    "Apply dependency updates, lint fixes, and small hygiene improvements without scope creep.",
  ),
];

mkdirSync(join(SEED_ROOT, "template-packs"), { recursive: true });
writeFileSync(
  join(PROFILES_ROOT, "manifest.json"),
  JSON.stringify(MANIFEST, null, 2) + "\n",
  "utf-8",
);

for (const entry of MANIFEST.profiles) {
  writeProfile(entry.slug, entry.personality, LEGACY_MAP[entry.slug]);
}

writeFileSync(
  join(SEED_ROOT, "template-packs", "control-hub-professional-v1.json"),
  JSON.stringify(
    {
      schemaVersion: "1.0.0",
      id: "control-hub-professional-v1",
      name: "Control Hub Professional",
      version: "1.0.0",
      templates,
    },
    null,
    2,
  ) + "\n",
  "utf-8",
);

console.log(
  `Wrote ${MANIFEST.profiles.length} profiles and ${templates.length} templates under data/seed/`,
);
