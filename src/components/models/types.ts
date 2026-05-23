// ═══════════════════════════════════════════════════════════════
// /config/models — API row shapes used by the models page
// ═══════════════════════════════════════════════════════════════

import type { ModelDefaults } from "@/lib/models-repository";

// Re-export for use in frontend code
export type ApiModelDefaults = ModelDefaults;

export interface ApiModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  baseUrl: string | null;
  contextLength: number | null;
  credentialsId: string | null;
  defaults: ApiModelDefaults;
  createdAt: string;
  updatedAt: string;
}

export interface ApiCredential {
  id: string;
  label: string;
  provider: string;
  keyHint: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncDrift {
  hasDrift: boolean;
  driftDetails?: string[];
}
