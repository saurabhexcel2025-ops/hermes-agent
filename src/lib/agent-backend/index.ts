// ═══════════════════════════════════════════════════════════════
// agent-backend/index.ts — Hermes mission dispatch contract
// ═══════════════════════════════════════════════════════════════

import type {
  Mission,
  DispatchMissionInput,
  MissionStatus,
} from "./types";

export interface AgentBackend {
  dispatchMission(input: DispatchMissionInput): Promise<Mission>;
  getMissionStatus(missionId: string): Promise<MissionStatus>;
  getMissionSessionId(missionId: string): Promise<string | null>;
  syncMission(
    missionId: string,
    updates: { prompt?: string; name?: string },
  ): Promise<void>;
}
