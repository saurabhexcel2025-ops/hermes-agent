// ═══════════════════════════════════════════════════════════════
// /config/models — API row shapes used by the models page
// ═══════════════════════════════════════════════════════════════

export interface ApiModelDefaults {
  agent: string | null;
  hindsight: string | null;
  compression: string | null;
  vision: string | null;
  web_extract: string | null;
  session_search: string | null;
  title_generation: string | null;
  skills_hub: string | null;
  mcp: string | null;
  triage_specifier: string | null;
  approval: string | null;
  delegation: string | null;
}

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
