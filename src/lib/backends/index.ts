// ═══════════════════════════════════════════════════════════════
// backends/index.ts — AgentBackend factory
// ═══════════════════════════════════════════════════════════════
// Pick the active backend based on CONTROL_HUB_BACKEND env var.
// hermes is the default.

import { AgentBackend } from "../agent-backend";
import { HermesAgentBackend } from "./hermes";

let _backend: AgentBackend | null = null;

export function getAgentBackend(): AgentBackend {
  if (_backend) return _backend;

  const backendId = process.env.CONTROL_HUB_BACKEND ?? "hermes";

  switch (backendId) {
    case "hermes":
      _backend = new HermesAgentBackend();
      break;
    default:
      // Unknown backend — fall back to Hermes
      _backend = new HermesAgentBackend();
  }

  return _backend;
}

/** Short alias used across the codebase */
export const agentBackend = getAgentBackend();
