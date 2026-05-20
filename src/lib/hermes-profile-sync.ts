// ═══════════════════════════════════════════════════════════════
// hermes-profile-sync.ts — Push/pull agent profiles to Hermes disk
// ═══════════════════════════════════════════════════════════════

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "fs";
import { createHash } from "crypto";

import { atomicWriteFile } from "./hermes-config-sync";
import { getHermesDefaultRoot } from "./hermes-profile-paths";
import { resolveProfileHermesHome } from "./hermes-profile-paths";
import { buildHermesPathBundle } from "./hermes-paths";
import {
  getProfile,
  listProfiles,
  setProfileSyncStatus,
  updateProfileContent,
  type AgentProfileRow,
} from "./profiles-repository";
import { now } from "./db";

const PROFILE_SUBDIRS = [
  "memories",
  "sessions",
  "skills",
  "skins",
  "logs",
  "plans",
  "workspace",
  "cron",
] as const;

export interface ProfilePushResult {
  success: boolean;
  slug: string;
  backupPath: string | null;
  error: string | null;
}

export interface ProfileDriftEntry {
  slug: string;
  drifted: boolean;
  fields: string[];
  syncError: string | null;
}

function fileHash(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, "utf-8");
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return null;
  }
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function ensureProfileDirs(root: string): void {
  for (const sub of PROFILE_SUBDIRS) {
    const dir = root + "/" + sub;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  const memories = root + "/memories";
  if (!existsSync(memories)) {
    mkdirSync(memories, { recursive: true });
  }
}

function ensureAuthJson(profileRoot: string, defaultRoot: string): void {
  const authPath = profileRoot + "/auth.json";
  if (existsSync(authPath)) return;
  const rootAuth = defaultRoot + "/auth.json";
  if (existsSync(rootAuth)) {
    copyFileSync(rootAuth, authPath);
  }
}

function profileRootForSlug(slug: string): string {
  return resolveProfileHermesHome(slug);
}

function writeWithBackup(targetPath: string, content: string, backupsDir: string): string | null {
  if (existsSync(targetPath)) {
    if (!existsSync(backupsDir)) {
      mkdirSync(backupsDir, { recursive: true });
    }
    const base = targetPath.split(/[/\\]/).pop() ?? "file";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = backupsDir + "/" + base + "." + ts + ".bak";
    copyFileSync(targetPath, backup);
  }
  atomicWriteFile(targetPath, content);
  return null;
}

export function pushProfileToHermes(slug: string): ProfilePushResult {
  const profile = getProfile(slug);
  if (!profile) {
    return { success: false, slug, backupPath: null, error: "Profile not found in database" };
  }

  try {
    const root = profileRootForSlug(slug);
    const defaultRoot = getHermesDefaultRoot();
    const bundle = buildHermesPathBundle(root);
    ensureProfileDirs(root);
    ensureAuthJson(root, defaultRoot);

    const backupsDir = bundle.backups;
    writeWithBackup(bundle.config, profile.configYaml || defaultConfigFromRow(profile), backupsDir);
    writeWithBackup(bundle.soul, profile.soulMd, backupsDir);
    writeWithBackup(bundle.agents, profile.agentsMd, backupsDir);

    if (!existsSync(bundle.userMemory)) {
      atomicWriteFile(bundle.userMemory, "# User\n");
    }
    if (!existsSync(bundle.agentMemory)) {
      atomicWriteFile(bundle.agentMemory, "# Memory\n");
    }

    setProfileSyncStatus(slug, now(), null);
    return { success: true, slug, backupPath: backupsDir, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setProfileSyncStatus(slug, null, message);
    return { success: false, slug, backupPath: null, error: message };
  }
}

function defaultConfigFromRow(profile: AgentProfileRow): string {
  return `agent:
  personality: ${profile.personality}
skills:
  enabled: []
`;
}

export function pushAllProfiles(options?: { onlyMissing?: boolean; onlyOutOfSync?: boolean }): ProfilePushResult[] {
  const results: ProfilePushResult[] = [];
  for (const profile of listProfiles()) {
    if (options?.onlyMissing) {
      const root = profileRootForSlug(profile.slug);
      // Match install.sh template copy: never overwrite existing SOUL/AGENTS on disk.
      if (existsSync(root + "/SOUL.md") || existsSync(root + "/AGENTS.md")) {
        continue;
      }
    }
    if (options?.onlyOutOfSync) {
      const drift = detectProfileDrift(profile.slug);
      if (!drift.drifted && profile.syncedAt && !profile.syncError) {
        continue;
      }
    }
    results.push(pushProfileToHermes(profile.slug));
  }
  return results;
}

export function pullProfileFromHermes(slug: string): ProfilePushResult {
  const root = profileRootForSlug(slug);
  const bundle = buildHermesPathBundle(root);
  try {
    const patch: Parameters<typeof updateProfileContent>[1] = {};
    if (existsSync(bundle.config)) {
      patch.configYaml = readFileSync(bundle.config, "utf-8");
    }
    if (existsSync(bundle.soul)) {
      patch.soulMd = readFileSync(bundle.soul, "utf-8");
    }
    if (existsSync(bundle.agents)) {
      patch.agentsMd = readFileSync(bundle.agents, "utf-8");
    }
    updateProfileContent(slug, patch);
    setProfileSyncStatus(slug, now(), null);
    return { success: true, slug, backupPath: null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, slug, backupPath: null, error: message };
  }
}

export function detectProfileDrift(slug: string): ProfileDriftEntry {
  const profile = getProfile(slug);
  if (!profile) {
    return { slug, drifted: false, fields: [], syncError: "not in database" };
  }

  const root = profileRootForSlug(slug);
  const bundle = buildHermesPathBundle(root);
  const fields: string[] = [];

  const diskConfig = fileHash(bundle.config);
  const dbConfig = contentHash(profile.configYaml || defaultConfigFromRow(profile));
  if (diskConfig !== dbConfig) fields.push("config.yaml");

  const diskSoul = fileHash(bundle.soul);
  const dbSoul = contentHash(profile.soulMd);
  if (diskSoul !== dbSoul) fields.push("SOUL.md");

  const diskAgents = fileHash(bundle.agents);
  const dbAgents = contentHash(profile.agentsMd);
  if (diskAgents !== dbAgents) fields.push("AGENTS.md");

  return {
    slug,
    drifted: fields.length > 0,
    fields,
    syncError: profile.syncError,
  };
}

export function detectAllProfileDrift(): ProfileDriftEntry[] {
  return listProfiles().map((p) => detectProfileDrift(p.slug));
}

export function removeProfileFromDisk(slug: string): void {
  if (slug === "default") return;
  const root = profileRootForSlug(slug);
  const parent = root.replace(/[/\\]+$/, "");
  const profilesDir = parent;
  if (existsSync(root) && root.includes("/profiles/")) {
    rmSync(root, { recursive: true, force: true });
  } else if (existsSync(root)) {
    const name = root.split(/[/\\]/).pop();
    if (name && existsSync(profilesDir)) {
      try {
        const entries = readdirSync(profilesDir);
        if (entries.includes(name)) {
          rmSync(root, { recursive: true, force: true });
        }
      } catch {
        // best-effort
      }
    }
  }
}

export function countProfileSkills(slug: string): number {
  const root = profileRootForSlug(slug);
  const skillsDir = root + "/skills";
  if (!existsSync(skillsDir)) return 0;
  let count = 0;
  const walk = (dir: string) => {
    for (const item of readdirSync(dir)) {
      const fullPath = dir + "/" + item;
      try {
        const st = statSync(fullPath);
        if (st.isDirectory()) {
          if (existsSync(fullPath + "/SKILL.md")) count += 1;
          else walk(fullPath);
        }
      } catch {
        // skip
      }
    }
  };
  walk(skillsDir);
  return count;
}
