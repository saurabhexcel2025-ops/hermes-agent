// ═══════════════════════════════════════════════════════════════
// sync-manager.ts — Push/Pull orchestration between Control Hub
//                      and Hermes config files
// ═══════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from "fs";
import * as yaml from "js-yaml";

import { getActiveHermesPaths } from "./hermes-agent-runtime";
import { getModel, listModels, getModelDefaults } from "./models-repository";
import { getCredentialWithKey, listCredentials } from "./credentials-repository";
import { listFallbackChain, getFallbackConfig } from "./fallbacks-repository";
import {
  syncSingleModelToHermesConfig,
  syncSingleCredentialToHermesEnv,
  syncFallbacksToHermesConfig,
  syncDefaultsToHermesConfig,
  readHermesConfigModels,
} from "./hermes-config-sync";
import { isHermesProvider, type HermesProvider, envVarForProvider } from "./hermes-providers";

// ── Types ────────────────────────────────────────────────────

export interface SyncActionResult {
  success: boolean;
  backupPath: string | null;
  details: Array<{ action: string; detail: string }>;
}

export interface DriftReport {
  modelsInHermesNotInDb: Array<{ name: string; provider: string; modelId: string }>;
  modelsInDbNotInHermes: Array<{ name: string; provider: string; modelId: string }>;
  primaryDiffers: { dbModel: string; hermesModel: string } | null;
}

// ── Internal helpers ─────────────────────────────────────────

interface ConfigModelSection {
  default?: string;
  provider?: string;
  base_url?: string;
  context_length?: number;
}

interface ConfigAuxiliaryEntry {
  provider?: string;
  model?: string;
  base_url?: string;
  api_key?: string;
}

interface HermesYamlConfig {
  model?: ConfigModelSection;
  auxiliary?: Record<string, ConfigAuxiliaryEntry>;
  [key: string]: unknown;
}

/**
 * Read the current `model.*` section from ~/.hermes/config.yaml.
 * Returns null if file doesn't exist or can't be parsed.
 */
function readHermesPrimaryModel(): { modelId: string; provider: string; baseUrl: string | null } | null {
  const paths = getActiveHermesPaths();
  if (!existsSync(paths.config)) return null;

  try {
    const raw = readFileSync(paths.config, "utf-8");
    const config = (yaml.load(raw) as HermesYamlConfig) ?? {};
    if (!config.model?.default) return null;
    return {
      modelId: config.model.default,
      provider: config.model.provider ?? "",
      baseUrl: config.model.base_url?.trim() || null,
    };
  } catch {
    return null;
  }
}

// ── Drift detection ───────────────────────────────────────────

/**
 * Compare active agent model in config.yaml against the DB default
 * for the Hermes agent. Also reports models present only in one
 * side or the other.
 */
export function detectConfigDrift(): DriftReport {
  const dbModels = listModels();
  const dbModelByKey = new Map(
    dbModels.map((m) => [`${m.provider}::${m.modelId}`, m])
  );

  // Read what's currently in config.yaml
  const hermesPrimary = readHermesPrimaryModel();
  const hermesModelMap = readHermesConfigModels();
  const hermesKeySet = new Set(hermesModelMap.keys());
  const hermesModels = [...hermesModelMap.values()].map((m) => ({
    name: m.modelId,
    provider: m.provider,
    modelId: m.modelId,
  }));

  // 1. Models in config.yaml but not in DB
  const modelsInHermesNotInDb = hermesModels.filter(
    (m) => !dbModelByKey.has(`${m.provider}::${m.modelId}`)
  );

  // 2. Models in DB but not in config.yaml (Hermes)
  const modelsInDbNotInHermes = dbModels.filter(
    (m) => !hermesKeySet.has(`${m.provider}::${m.modelId}`)
  );

  // 3. Primary model drift
  let primaryDiffers: DriftReport["primaryDiffers"] = null;
  if (hermesPrimary) {
    // Find the DB model that matches the hermes primary by provider+modelId
    const matched = dbModelByKey.get(`${hermesPrimary.provider}::${hermesPrimary.modelId}`);
    if (matched) {
      // Compare with the DB default agent model for Hermes
      const dbDefaults = getModelDefaults();
      const defaultAgentId = dbDefaults.agent;
      if (defaultAgentId) {
        const dbDefault = getModel(defaultAgentId);
        if (dbDefault && dbDefault.id !== matched.id) {
          primaryDiffers = {
            dbModel: `${dbDefault.provider}/${dbDefault.modelId}`,
            hermesModel: `${matched.provider}/${matched.modelId}`,
          };
        }
      }
    } else {
      // Primary in config but not matched in DB — treat as drift
      primaryDiffers = {
        dbModel: "none",
        hermesModel: `${hermesPrimary.provider}/${hermesPrimary.modelId}`,
      };
    }
  }

  return { modelsInHermesNotInDb, modelsInDbNotInHermes, primaryDiffers };
}

// ── Model push ───────────────────────────────────────────────

/**
 * Push a single model to Hermes config.yaml.
 * Updates only model.* section (not auxiliary).
 */
export function pushModelToHermes(modelId: string): SyncActionResult {
  const model = getModel(modelId);
  if (!model) {
    return { success: false, backupPath: null, details: [{ action: "error", detail: "Model not found" }] };
  }
  try {
    const { backupPath } = syncSingleModelToHermesConfig(modelId);
    return {
      success: true,
      backupPath,
      details: [
        {
          action: "pushed",
          detail: `${model.name} (${model.provider}/${model.modelId}) written to config.yaml`,
        },
      ],
    };
  } catch (err) {
    return {
      success: false,
      backupPath: null,
      details: [
        {
          action: "error",
          detail: String(err instanceof Error ? err.message : err),
        },
      ],
    };
  }
}

// ── Credential push (Control Hub → Hermes .env) ──────────────

/**
 * Push a credential (provider + apiKey) to the Hermes .env file.
 */
function pushCredentialToHermesEnv(provider: string, apiKey: string): SyncActionResult {
  if (!isHermesProvider(provider as HermesProvider)) {
    return {
      success: false,
      backupPath: null,
      details: [{ action: "error", detail: `Unknown provider: ${provider}` }],
    };
  }
  try {
    const { backupPath } = syncSingleCredentialToHermesEnv(
      provider as HermesProvider,
      apiKey
    );
    return {
      success: true,
      backupPath,
      details: [
        {
          action: "pushed",
          detail: `Credential for ${provider} written to .env`,
        },
      ],
    };
  } catch (err) {
    return {
      success: false,
      backupPath: null,
      details: [
        {
          action: "error",
          detail: String(err instanceof Error ? err.message : err),
        },
      ],
    };
  }
}

// ── Credential push (registry → Hermes .env) ─────────────────

/**
 * Push credential to .env for a given credential ID.
 */
export function pushCredential(credentialId: string): SyncActionResult {
  const cred = getCredentialWithKey(credentialId);
  if (!cred) {
    return {
      success: false,
      backupPath: null,
      details: [{ action: "error", detail: "Credential not found" }],
    };
  }
  return pushCredentialToHermesEnv(cred.provider, cred.apiKey);
}
