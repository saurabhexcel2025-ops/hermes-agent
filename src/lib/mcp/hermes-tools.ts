// ═══════════════════════════════════════════════════════════════
// mcp/hermes-tools.ts — Hermes Tools MCP Adapter
// ═══════════════════════════════════════════════════════════════
// Wraps Hermes platform toolsets as MCP tool definitions.
// Registered in the tool registry so the UI can show Hermes tools
// alongside Control Hub's own MCP tools.

import type { ToolDefinition } from "../agent-backend/types";

/**
 * Convert Hermes toolset definitions to MCP tool format.
 * These are registered in the tool_registry table with category='mcp'.
 */
export function hermesToolsToMcpTools(
  tools: ToolDefinition[]
): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return tools.map((t) => ({
    name: `hermes:${t.name}`,
    description: t.description,
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", description: "Agent profile ID" },
      },
    },
  }));
}

/**
 * Hermes MCP server command bootstrap.
 * When Hermes is the active backend, this returns the stdio MCP command.
 */
export function getHermesMcpCommand(): { command: string; args: string[] } | null {
  try {
    // Check if hermes-mcp is available
    const { execSync } = require("child_process");
    try {
      execSync("which hermes-mcp", { stdio: "ignore" });
      return { command: "hermes-mcp", args: [] };
    } catch {
      // hermes-mcp not found, try stdio bootstrap
    }
  } catch { /* exec unavailable */ }

  return null;
}
