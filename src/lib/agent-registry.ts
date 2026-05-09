// ═══════════════════════════════════════════════════════════════
// agent-registry.ts — Persisted Hermes installs (v1: framework hermes only)
// ═══════════════════════════════════════════════════════════════

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { CH_DATA_DIR } from "./paths";

const REGISTRY_VERSION = 1;
const REGISTRY_FILENAME = "agents-registry.json";

export type HermesFrameworkId = "hermes";

export interface AgentRegistryEntry {
  id: string;
  label: string;
  framework: HermesFrameworkId;
  filesystemRoot: string;
  /** e.g. http://127.0.0.1:8642 — local gateway health + LLM base */
  gatewayBaseUrl?: string;
  /** Full chat completions URL, or omitted to derive from gatewayBaseUrl */
  llmBaseUrl?: string;
}

export interface AgentRegistryFile {
  version: number;
  activeAgentId: string;
  agents: AgentRegistryEntry[];
}

function registryFilePath(): string {
  return CH_DATA_DIR + "/" + REGISTRY_FILENAME;
}

function envDefaultRoot(): string {
  const raw = process.env.AGENT_HOME || process.env.HERMES_HOME;
  if (raw && String(raw).trim()) {
    return String(raw).trim().replace(/[/\\]+$/, "");
  }
  return homedir() + "/.hermes";
}

function defaultRegistry(): AgentRegistryFile {
  const filesystemRoot = envDefaultRoot();
  return {
    version: REGISTRY_VERSION,
    activeAgentId: "default",
    agents: [
      {
        id: "default",
        label: "Default Hermes",
        framework: "hermes",
        filesystemRoot,
      },
    ],
  };
}

export function readAgentRegistry(): AgentRegistryFile {
  const p = registryFilePath();
  if (!existsSync(p)) {
    const data = defaultRegistry();
    mkdirSync(CH_DATA_DIR, { recursive: true });
    writeFileSync(p, JSON.stringify(data, null, 2), { mode: 0o600 });
    return data;
  }
  try {
    const raw = readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as AgentRegistryFile;
    if (!parsed.agents || !Array.isArray(parsed.agents) || parsed.agents.length === 0) {
      return defaultRegistry();
    }
    const active = parsed.activeAgentId || parsed.agents[0].id;
    const activeExists = parsed.agents.some((a) => a.id === active);
    return {
      version: parsed.version || REGISTRY_VERSION,
      activeAgentId: activeExists ? active : parsed.agents[0].id,
      agents: parsed.agents.map((a) => ({
        id: String(a.id),
        label: String(a.label || a.id),
        framework: (a.framework === "hermes" ? "hermes" : "hermes") as HermesFrameworkId,
        filesystemRoot: String(a.filesystemRoot || "").replace(/[/\\]+$/, ""),
        gatewayBaseUrl:
          typeof a.gatewayBaseUrl === "string" && a.gatewayBaseUrl.trim()
            ? a.gatewayBaseUrl.trim()
            : undefined,
        llmBaseUrl:
          typeof a.llmBaseUrl === "string" && a.llmBaseUrl.trim()
            ? a.llmBaseUrl.trim()
            : undefined,
      })),
    };
  } catch {
    return defaultRegistry();
  }
}

export function writeAgentRegistry(data: AgentRegistryFile): void {
  mkdirSync(CH_DATA_DIR, { recursive: true });
  const p = registryFilePath();
  writeFileSync(p, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function getActiveAgentEntry(): AgentRegistryEntry | null {
  const reg = readAgentRegistry();
  return reg.agents.find((a) => a.id === reg.activeAgentId) ?? reg.agents[0] ?? null;
}

export function listFilesystemRootsForWorkspacePolicy(): string[] {
  const reg = readAgentRegistry();
  const roots = new Set<string>();
  for (const a of reg.agents) {
    if (a.filesystemRoot) roots.add(a.filesystemRoot.replace(/[/\\]+$/, ""));
  }
  if (roots.size === 0) roots.add(envDefaultRoot());
  return Array.from(roots);
}

export function setActiveAgentId(agentId: string): { ok: true } | { ok: false; error: string } {
  const reg = readAgentRegistry();
  if (!reg.agents.some((a) => a.id === agentId)) {
    return { ok: false, error: "Unknown agent id" };
  }
  writeAgentRegistry({ ...reg, activeAgentId: agentId });
  return { ok: true };
}

export function upsertAgentEntry(entry: AgentRegistryEntry): void {
  const reg = readAgentRegistry();
  const idx = reg.agents.findIndex((a) => a.id === entry.id);
  const next = [...reg.agents];
  if (idx >= 0) next[idx] = entry;
  else next.push(entry);
  writeAgentRegistry({ ...reg, agents: next });
}
