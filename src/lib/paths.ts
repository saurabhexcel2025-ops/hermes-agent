// ═══════════════════════════════════════════════════════════════
// paths.ts — Control Hub data directories and paths
// ═══════════════════════════════════════════════════════════════
// This file replaces lib/hermes.ts for agent-agnostic paths.
// Only Hermes-specific paths (AGENT_HOME) remain coupled to Hermes.

import { homedir } from "os";

// ── Agent home (currently always Hermes) ────────────────────────
// Future backends can set their own AGENT_HOME.
export const AGENT_HOME =
  process.env.AGENT_HOME || process.env.HERMES_HOME || homedir() + "/.hermes";

// ── Control Hub data root ───────────────────────────────────────
function normalizeDirPath(dir: string): string {
  return dir.replace(/[/\\]+$/, "");
}

export function getChDataDir(): string {
  const raw = process.env.CH_DATA_DIR || process.env.CONTROL_HUB_DATA_DIR;
  if (raw && String(raw).trim()) {
    return normalizeDirPath(String(raw).trim());
  }
  return normalizeDirPath(homedir() + "/control-hub/data");
}

export const CH_DATA_DIR = getChDataDir();

// ── Standard path constants ──────────────────────────────────────

export const PATHS = {
  // Control Hub owns these
  controlHubDb: CH_DATA_DIR + "/control-hub.db",
  missions: CH_DATA_DIR + "/missions",
  templates: CH_DATA_DIR + "/templates",
  stories: CH_DATA_DIR + "/stories",
  recroom: CH_DATA_DIR + "/recroom",
  workspaces: CH_DATA_DIR + "/workspaces",
  teams: CH_DATA_DIR + "/teams",
  auditLog: CH_DATA_DIR + "/audit",

  // Agent-specific (Hermes) — these are coupled to Hermes
  // and will be abstracted via AgentBackend in future
  agentConfig: AGENT_HOME + "/config.yaml",
  agentEnv: AGENT_HOME + "/.env",
  agentSoul: AGENT_HOME + "/SOUL.md",
  agentHermes: AGENT_HOME + "/HERMES.md",
  agentAgents: AGENT_HOME + "/AGENTS.md",
  agentSkills: AGENT_HOME + "/skills",
  agentProfiles: AGENT_HOME + "/profiles",
  agentCronJobs: AGENT_HOME + "/cron/jobs.json",
  agentSessions: AGENT_HOME + "/sessions",
  agentLogs: AGENT_HOME + "/logs",
  agentBackups: AGENT_HOME + "/backups",
  agentMemoryDb: AGENT_HOME + "/memory_store.db",
} as const;

// ── YAML config reader ─────────────────────────────────────────

import { existsSync, readFileSync } from "fs";
import * as yaml from "js-yaml";

export function getConfigValue(content: string, dottedKey: string): string {
  try {
    const parsed = yaml.load(content) as Record<string, unknown>;
    const keys = dottedKey.split(".");
    let current: unknown = parsed;
    for (const key of keys) {
      if (typeof current !== "object" || current === null) return "";
      current = (current as Record<string, unknown>)[key];
    }
    return typeof current === "string" ? current : current != null ? String(current) : "";
  } catch {
    return "";
  }
}

// ── Discord home channel ───────────────────────────────────────

export function getDiscordHomeChannel(envContent: string): string {
  const match = envContent.match(/^DISCORD_HOME_CHANNEL=(.+)$/m);
  if (match) return match[1].trim().replace(/^['"]|['"]$/g, "");
  return "";
}

// ── Default model config (reads Hermes config.yaml) ─────────────
// NOTE: This reads the Hermes config — it's Hermes-specific and
// will be moved into HermesAgentBackend once that exists.

export interface DefaultModelConfig {
  model: string;
  provider: string;
  base_url: string;
  api_key: string;
}

export function getDefaultModelConfig(): DefaultModelConfig {
  try {
    if (!existsSync(PATHS.agentConfig)) {
      return { model: "", provider: "", base_url: "", api_key: "" };
    }
    const content = readFileSync(PATHS.agentConfig, "utf-8");
    const parsed = yaml.load(content) as Record<string, unknown>;
    const modelSection = parsed?.model;

    if (typeof modelSection === "string") {
      return { model: modelSection, provider: "", base_url: "", api_key: "" };
    }
    if (typeof modelSection === "object" && modelSection !== null) {
      const ch = modelSection as Record<string, unknown>;
      const defaultModel =
        typeof ch.default === "string"
          ? ch.default
          : typeof ch.model === "string"
          ? ch.model
          : "";
      return {
        model: defaultModel,
        provider: typeof ch.provider === "string" ? ch.provider : "",
        base_url: typeof ch.base_url === "string" ? ch.base_url : "",
        api_key: typeof ch.api_key === "string" ? ch.api_key : "",
      };
    }
    return { model: "", provider: "", base_url: "", api_key: "" };
  } catch {
    return { model: "", provider: "", base_url: "", api_key: "" };
  }
}
