// ═══════════════════════════════════════════════════════════════
// backends/hermes.ts — Hermes mission dispatch backend
// ═══════════════════════════════════════════════════════════════

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";

import { PATHS } from "../paths";
import { resolveProfileHermesHome } from "../hermes-profile-paths";
import type {
  Mission,
  DispatchMissionInput,
  MissionStatus,
} from "../agent-backend/types";
import type { AgentBackend } from "../agent-backend";
import { logApiError } from "../api-logger";
import { getDefaultModel } from "../models-repository";
import { getCredentialWithKey } from "../credentials-repository";

interface BuildHermesChatArgvInput {
  profileName?: string;
  modelId?: string;
  provider?: string;
  source: string;
}

export function buildHermesChatArgv(input: BuildHermesChatArgvInput): string[] {
  const argv: string[] = [];
  if (input.profileName && input.profileName.trim().length > 0) {
    argv.push("--profile", input.profileName);
  }
  argv.push("chat");
  if (input.modelId && input.modelId.trim().length > 0) {
    argv.push("--model", input.modelId);
  }
  if (input.provider && input.provider.trim().length > 0) {
    argv.push("--provider", input.provider);
  }
  argv.push("--quiet", "--source", input.source, "--pass-session-id");
  return argv;
}

function shellQuote(value: string): string {
  if (value.length === 0) return "''";
  if (/^[A-Za-z0-9_./:@%+=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function resolveMissionModel(input: {
  modelId?: string;
  provider?: string;
}): Promise<{ modelId: string; provider: string; apiKey: string | null }> {
  if (input.modelId && input.provider) {
    return { modelId: input.modelId, provider: input.provider, apiKey: null };
  }

  try {
    const defaultModel = getDefaultModel("agent");
    if (defaultModel) {
      let apiKey: string | null = null;
      if (defaultModel.credentialsId) {
        const cred = getCredentialWithKey(defaultModel.credentialsId);
        apiKey = cred?.apiKey ?? null;
      }
      return {
        modelId: defaultModel.modelId,
        provider: defaultModel.provider,
        apiKey,
      };
    }
  } catch (err) {
    logApiError("resolveMissionModel", "registry lookup", err);
  }

  return { modelId: "", provider: "", apiKey: null };
}

async function ensureProfileAuth(
  profileName: string,
  apiKey: string | null,
): Promise<void> {
  if (!apiKey || !profileName || profileName === "default") return;

  const profilePath = resolveProfileHermesHome(profileName);
  const authPath = join(profilePath, "auth.json");
  const envPath = join(profilePath, ".env");

  let existingAuth: Record<string, unknown> = {};
  if (existsSync(authPath)) {
    try {
      existingAuth = JSON.parse(readFileSync(authPath, "utf-8")) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }

  const pool = (existingAuth["credential_pool"] as Record<string, string[]> | undefined) ?? {};
  const authProviders =
    (existingAuth["providers"] as Record<string, { api_key?: string }> | undefined) ?? {};

  const needsAuthWrite =
    authProviders["minimax"]?.api_key !== apiKey ||
    !Array.isArray(pool["minimax"]) ||
    !pool["minimax"].includes("minimax");

  if (needsAuthWrite) {
    const updated = {
      version: 1,
      providers: { ...authProviders, minimax: { api_key: apiKey } },
      credential_pool: { ...pool, minimax: ["minimax"] },
    };
    try {
      mkdirSync(profilePath, { recursive: true });
      writeFileSync(authPath, JSON.stringify(updated, null, 2));
    } catch (err) {
      logApiError("ensureProfileAuth", `auth profile=${profileName}`, err);
    }
  }

  let existingEnv = "";
  if (existsSync(envPath)) {
    existingEnv = readFileSync(envPath, "utf-8");
  }
  const envLines = existingEnv.split("\n").filter((l) => !l.startsWith("MINIMAX_API_KEY="));
  envLines.push(`MINIMAX_API_KEY=${apiKey}`);

  try {
    writeFileSync(envPath, envLines.join("\n") + "\n");
  } catch (err) {
    logApiError("ensureProfileAuth", `env profile=${profileName}`, err);
  }
}

interface SpawnHermesChatInput {
  argv: string[];
  prompt: string;
  missionId: string;
  statusFile: string;
  outputFile: string;
  sessionFile: string;
  hermesHome: string;
}

export function spawnHermesChatWithStatusCallback(input: SpawnHermesChatInput): void {
  const promptArg = `-q "$CH_MISSION_PROMPT"`;
  const argvStr = input.argv.map(shellQuote).join(" ");
  const scriptLines = [
    "#!/bin/bash",
    `hermes ${argvStr} ${promptArg} > ${shellQuote(input.sessionFile)} 2>&1`,
    "ec=$?",
    `cat ${shellQuote(input.sessionFile)} >> ${shellQuote(input.outputFile)}`,
    `if [ "$ec" -eq 0 ]; then printf '{"status":"successful","exit_code":%s,"completed_at":"%s"}\n' "$ec" "$(date -u +%FT%TZ)" > ${shellQuote(input.statusFile)}; else printf '{"status":"failed","exit_code":%s,"completed_at":"%s","error":"hermes chat exited %s"}\n' "$ec" "$(date -u +%FT%TZ)" "$ec" > ${shellQuote(input.statusFile)}; fi`,
  ];

  const scriptPath = join(tmpdir(), `hermes_mission_${input.missionId}.sh`);
  writeFileSync(scriptPath, scriptLines.join("\n"));

  const child = spawn("bash", [scriptPath], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      HERMES_HOME: input.hermesHome,
      CH_MISSION_PROMPT: input.prompt,
      CH_MISSION_ID: input.missionId,
    },
  });
  child.unref();
}

export class HermesAgentBackend implements AgentBackend {
  async dispatchMission(input: DispatchMissionInput): Promise<Mission> {
    const id = input.missionId ?? randomUUID();
    const now = new Date().toISOString();
    const mission: Mission = {
      id,
      name: input.name,
      prompt: input.prompt,
      profileId: input.profileId,
      status: "dispatched",
      createdAt: now,
      updatedAt: now,
    };

    const missionsDir = PATHS.missions;
    if (!existsSync(missionsDir)) {
      mkdirSync(missionsDir, { recursive: true });
    }

    const missionFile = join(missionsDir, `${id}.json`);
    const statusFile = join(missionsDir, `${id}.status.json`);
    const outputFile = join(missionsDir, `${id}.output.log`);
    const sessionFile = join(missionsDir, `${id}.session`);

    writeFileSync(missionFile, JSON.stringify(mission, null, 2));

    const resolved = await resolveMissionModel({
      modelId: input.modelId,
      provider: input.provider,
    });

    if (resolved.apiKey) {
      await ensureProfileAuth(input.profileName ?? "default", resolved.apiKey);
    }

    const profileName = input.profileName ?? "default";
    const profileHome = resolveProfileHermesHome(profileName);

    const cliArgv = buildHermesChatArgv({
      profileName: input.profileName,
      modelId: resolved.modelId || undefined,
      provider: resolved.provider || undefined,
      source: "control-hub-mission",
    });

    spawnHermesChatWithStatusCallback({
      argv: cliArgv,
      prompt: input.prompt,
      missionId: id,
      statusFile,
      outputFile,
      sessionFile,
      hermesHome: profileHome,
    });

    return mission;
  }

  async getMissionStatus(missionId: string): Promise<MissionStatus> {
    try {
      const statusPath = join(PATHS.missions, `${missionId}.status.json`);
      if (existsSync(statusPath)) {
        const data = JSON.parse(readFileSync(statusPath, "utf-8"));
        const status = data?.status as MissionStatus | undefined;
        if (
          status === "queued" ||
          status === "dispatched" ||
          status === "successful" ||
          status === "failed"
        ) {
          return status;
        }
      }
      const missionPath = join(PATHS.missions, `${missionId}.json`);
      if (existsSync(missionPath)) {
        return "dispatched";
      }
      return "queued";
    } catch {
      return "queued";
    }
  }

  async getMissionSessionId(missionId: string): Promise<string | null> {
    try {
      const sessionPath = join(PATHS.missions, `${missionId}.session`);
      if (!existsSync(sessionPath)) return null;
      const content = readFileSync(sessionPath, "utf-8").trim();
      const match = content.match(/session_id:\s*(\S+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async syncMission(
    missionId: string,
    updates: { prompt?: string; name?: string },
  ): Promise<void> {
    try {
      const path = join(PATHS.missions, `${missionId}.json`);
      if (!existsSync(path)) return;
      const mission = JSON.parse(readFileSync(path, "utf-8"));
      if (updates.prompt !== undefined) mission.prompt = updates.prompt;
      if (updates.name !== undefined) mission.name = updates.name;
      mission.updatedAt = new Date().toISOString();
      writeFileSync(path, JSON.stringify(mission, null, 2));
    } catch (err) {
      logApiError("HermesAgentBackend.syncMission", "syncMission", err);
    }
  }
}
