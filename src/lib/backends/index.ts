// ═══════════════════════════════════════════════════════════════
// backends/index.ts — AgentBackend factory (Hermes)
// ═══════════════════════════════════════════════════════════════

import { AgentBackend } from "../agent-backend";
import { HermesAgentBackend } from "./hermes";

let _backend: AgentBackend | null = null;

export function getAgentBackend(): AgentBackend {
  if (_backend) return _backend;
  _backend = new HermesAgentBackend();
  return _backend;
}

/** Short alias used across the codebase */
export const agentBackend = getAgentBackend();
