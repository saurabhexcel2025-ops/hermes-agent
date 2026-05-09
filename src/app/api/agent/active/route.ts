import { NextRequest, NextResponse } from "next/server";

import { setActiveAgentId, upsertAgentEntry, readAgentRegistry } from "@/lib/agent-registry";
import type { AgentRegistryEntry } from "@/lib/agent-registry";
import { logApiError } from "@/lib/api-logger";
import { requireNotReadOnly, requireMcApiKey } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const ro = requireNotReadOnly();
  if (ro) return ro;
  const auth = requireMcApiKey(request);
  if (auth) return auth;

  try {
    const body = await request.json();
    const { agentId, register } = body as {
      agentId?: string;
      register?: AgentRegistryEntry;
    };

    if (register && typeof register === "object" && register.id && register.filesystemRoot) {
      upsertAgentEntry({
        id: String(register.id),
        label: String(register.label || register.id),
        framework: "hermes",
        filesystemRoot: String(register.filesystemRoot).replace(/[/\\]+$/, ""),
        gatewayBaseUrl: register.gatewayBaseUrl,
        llmBaseUrl: register.llmBaseUrl,
      });
    }

    if (!agentId || typeof agentId !== "string") {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const result = setActiveAgentId(agentId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const reg = readAgentRegistry();
    return NextResponse.json({
      data: { activeAgentId: reg.activeAgentId, agents: reg.agents },
    });
  } catch (error) {
    logApiError("POST /api/agent/active", "set active", error);
    return NextResponse.json({ error: "Failed to set active agent" }, { status: 500 });
  }
}
