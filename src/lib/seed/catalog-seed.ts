// ═══════════════════════════════════════════════════════════════
// catalog-seed.ts — Seed professional catalog into SQLite
// ═══════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { ensureDb } from "../db";
import { upsertProfile, getProfileBySeedKey } from "../profiles-repository";
import { upsertCatalogTemplate, getCatalogTemplate } from "../catalog-template-repository";
import { db } from "../db";
import { CH_DATA_DIR, PATHS } from "../paths";
import { pushProfileToHermes, pushAllProfiles } from "../hermes-profile-sync";
import { writeFileSync, mkdirSync } from "fs";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const PROFILES_MANIFEST = join(REPO_ROOT, "data/seed/profiles/manifest.json");
const TEMPLATE_PACK = join(
  REPO_ROOT,
  "data/seed/template-packs/control-hub-professional-v1.json",
);

export type SeedMode = "merge" | "replace";

export interface SeedTarget {
  target: "all" | "profiles" | "templates" | "categories";
  slug?: string;
  templateId?: string;
  mode: SeedMode;
}

export interface SeedResult {
  profiles: number;
  templates: number;
  categories: number;
  pushed: number;
}

interface ProfileManifestEntry {
  slug: string;
  displayName: string;
  description: string;
  personality: string;
  seedKey: string;
}

interface ProfileManifest {
  version: string;
  profiles: ProfileManifestEntry[];
}

interface TemplatePackEntry {
  id: string;
  seedKey?: string;
  name: string;
  icon: string;
  color: string;
  categoryId: string;
  profile: string;
  description: string;
  instruction: string;
  context: string;
  goals: string[];
  outputFormat: string;
  constraints: string;
  suggestedSkills?: string[];
  localDirs?: string[];
  references?: string[];
  missionTimeMinutes?: number;
  timeoutMinutes: number;
}

interface TemplatePack {
  schemaVersion: string;
  id: string;
  name: string;
  version: string;
  templates: TemplatePackEntry[];
}

function readProfileFiles(slug: string): { soulMd: string; agentsMd: string; configYaml: string } {
  const base = join(REPO_ROOT, "data/seed/profiles", slug);
  const soulPath = base + "/SOUL.md";
  const agentsPath = base + "/AGENTS.md";
  const configPath = base + "/config.yaml";
  return {
    soulMd: existsSync(soulPath) ? readFileSync(soulPath, "utf-8") : "",
    agentsMd: existsSync(agentsPath) ? readFileSync(agentsPath, "utf-8") : "",
    configYaml: existsSync(configPath)
      ? readFileSync(configPath, "utf-8")
      : `agent:\n  personality: technical\nskills:\n  enabled: []\n`,
  };
}

function seedCategories(mode: SeedMode): number {
  const sqlPath = join(REPO_ROOT, "src/lib/db/seeds/001_mission_categories.sql");
  if (!existsSync(sqlPath)) return 0;
  const sql = readFileSync(sqlPath, "utf-8");
  if (mode === "replace") {
    db().exec("DELETE FROM mission_categories WHERE seed_key IS NOT NULL");
  }
  db().exec(sql);
  const row = db()
    .prepare("SELECT COUNT(*) AS c FROM mission_categories WHERE seed_key IS NOT NULL")
    .get() as { c: number };
  return row.c ?? 0;
}

function seedProfiles(mode: SeedMode, slugFilter?: string): number {
  if (!existsSync(PROFILES_MANIFEST)) return 0;
  const manifest = JSON.parse(readFileSync(PROFILES_MANIFEST, "utf-8")) as ProfileManifest;
  let count = 0;
  for (const entry of manifest.profiles) {
    if (slugFilter && entry.slug !== slugFilter) continue;
    if (mode === "merge" && getProfileBySeedKey(entry.seedKey)) continue;

    const files = readProfileFiles(entry.slug);
    upsertProfile({
      slug: entry.slug,
      displayName: entry.displayName,
      description: entry.description,
      personality: entry.personality,
      configYaml: files.configYaml,
      soulMd: files.soulMd,
      agentsMd: files.agentsMd,
      seedKey: entry.seedKey,
    });
    count += 1;
  }
  return count;
}

function seedTemplates(mode: SeedMode, idFilter?: string): number {
  if (!existsSync(TEMPLATE_PACK)) return 0;
  const pack = JSON.parse(readFileSync(TEMPLATE_PACK, "utf-8")) as TemplatePack;
  let count = 0;
  for (const t of pack.templates) {
    if (idFilter && t.id !== idFilter) continue;
    const seedKey = t.seedKey ?? `ch.tpl.${t.id}`;
    if (mode === "merge") {
      const existing = getCatalogTemplate(t.id);
      if (existing?.seedKey) continue;
    }

    upsertCatalogTemplate({
      id: t.id,
      seedKey,
      name: t.name,
      icon: t.icon,
      color: t.color,
      categoryId: t.categoryId,
      profileSlug: t.profile,
      description: t.description,
      instruction: t.instruction,
      context: t.context,
      goals: t.goals,
      outputFormat: t.outputFormat,
      constraints: t.constraints,
      suggestedSkills: t.suggestedSkills ?? [],
      localDirs: t.localDirs ?? [],
      references: t.references ?? [],
      missionTimeMinutes: t.missionTimeMinutes ?? null,
      timeoutMinutes: t.timeoutMinutes,
    });
    count += 1;
  }
  return count;
}

function writeSeedState(result: SeedResult): void {
  const dir = CH_DATA_DIR;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const state = {
    lastRun: new Date().toISOString(),
    catalogVersion: "control-hub-professional-v1",
    ...result,
  };
  writeFileSync(dir + "/seed-state.json", JSON.stringify(state, null, 2));
}

export function runCatalogSeed(options: SeedTarget): SeedResult {
  ensureDb();
  const mode = options.mode;
  let profiles = 0;
  let templates = 0;
  let categories = 0;

  if (options.target === "all" || options.target === "categories") {
    categories = seedCategories(mode);
  }
  if (options.target === "all" || options.target === "profiles") {
    profiles = seedProfiles(mode, options.slug);
  }
  if (options.target === "all" || options.target === "templates") {
    templates = seedTemplates(mode, options.templateId);
  }

  let pushed = 0;
  if (options.target === "all" || options.target === "profiles") {
    const pushResults =
      options.slug != null
        ? [pushProfileToHermes(options.slug)]
        : pushAllProfiles({ onlyMissing: mode === "merge", onlyOutOfSync: false });
    pushed = pushResults.filter((r) => r.success).length;
  } else if (options.slug) {
    const r = pushProfileToHermes(options.slug);
    if (r.success) pushed = 1;
  }

  const result: SeedResult = { profiles, templates, categories, pushed };
  writeSeedState(result);
  return result;
}

export function getSeedState(): Record<string, unknown> | null {
  const path = CH_DATA_DIR + "/seed-state.json";
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
