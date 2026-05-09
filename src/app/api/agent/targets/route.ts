import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";

import { readAgentRegistry } from "@/lib/agent-registry";
import { logApiError } from "@/lib/api-logger";
import { CH_DATA_DIR } from "@/lib/paths";

const DISCOVERY_FILE = CH_DATA_DIR + "/agents.discovery.json";

export async function GET() {
  try {
    const reg = readAgentRegistry();
    let discovery: unknown = null;
    if (existsSync(DISCOVERY_FILE)) {
      try {
        discovery = JSON.parse(readFileSync(DISCOVERY_FILE, "utf-8"));
      } catch {
        discovery = null;
      }
    }
    return NextResponse.json({
      data: {
        activeAgentId: reg.activeAgentId,
        agents: reg.agents,
        discovery,
      },
    });
  } catch (error) {
    logApiError("GET /api/agent/targets", "read registry", error);
    return NextResponse.json({ error: "Failed to read agent targets" }, { status: 500 });
  }
}
