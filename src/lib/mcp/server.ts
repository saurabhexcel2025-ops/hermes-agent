// ═══════════════════════════════════════════════════════════════
// mcp/server.ts — Control Hub MCP Server Bootstrap
// ═══════════════════════════════════════════════════════════════
// Implements MCP protocol over stdio.
// Control Hub exposes its built-in tools (kanban, goals, stories,
// profiles) as MCP tools so any MCP-capable agent can use them.

import { stdin, stdout } from "process";

interface MCPRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Tool Definitions ────────────────────────────────────────

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const TOOLS: Tool[] = [
  {
    name: "list_boards",
    description: "List all Kanban boards",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const { listBoards } = await import("../kanban-repository");
      const boards = listBoards();
      return { boards };
    },
  },
  {
    name: "get_board",
    description: "Get a full Kanban board with columns and cards",
    inputSchema: {
      type: "object",
      required: ["boardId"],
      properties: {
        boardId: { type: "string", description: "Board ID" },
      },
    },
    handler: async (args) => {
      const { loadKanbanDocument } = await import("../kanban-repository");
      const doc = loadKanbanDocument(args.boardId as string);
      return doc ?? { error: "Board not found" };
    },
  },
  {
    name: "create_card",
    description: "Create a new Kanban card",
    inputSchema: {
      type: "object",
      required: ["boardId", "columnId", "title"],
      properties: {
        boardId: { type: "string" },
        columnId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
      },
    },
    handler: async (args) => {
      const { createCard } = await import("../kanban-repository");
      const card = createCard({
        boardId: args.boardId as string,
        columnId: args.columnId as string,
        title: args.title as string,
        description: (args.description as string) ?? "",
        labels: (args.labels as string[]) ?? [],
      });
      return { card };
    },
  },
  {
    name: "move_card",
    description: "Move a card to a different column",
    inputSchema: {
      type: "object",
      required: ["cardId", "toColumnId"],
      properties: {
        cardId: { type: "string" },
        toColumnId: { type: "string" },
        toPosition: { type: "integer" },
      },
    },
    handler: async (args) => {
      const { moveCard } = await import("../kanban-repository");
      const card = moveCard(
        args.cardId as string,
        args.toColumnId as string,
        (args.toPosition as number) ?? 0
      );
      return { card };
    },
  },
  {
    name: "list_stories",
    description: "List all Story Weaver stories",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const { listStories } = await import("../story-repository");
      return { stories: listStories() };
    },
  },
  {
    name: "get_story",
    description: "Get a Story Weaver story by ID",
    inputSchema: {
      type: "object",
      required: ["storyId"],
      properties: { storyId: { type: "string" } },
    },
    handler: async (args) => {
      const { getStory } = await import("../story-repository");
      const story = getStory(args.storyId as string);
      return story ?? { error: "Story not found" };
    },
  },
  {
    name: "list_profiles",
    description: "List all agent profiles",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const { listProfiles } = await import("../profile-repository");
      return { profiles: listProfiles() };
    },
  },
  {
    name: "list_missions",
    description: "List all missions",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const { listMissions } = await import("../mission-repository");
      return { missions: listMissions() };
    },
  },
  {
    name: "dispatch_mission",
    description: "Dispatch a new mission",
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        name: { type: "string" },
        prompt: { type: "string" },
        profileId: { type: "string" },
      },
    },
    handler: async (args) => {
      const { agentBackend } = await import("../backends");
      const { createMission } = await import("../mission-repository");
      const mission = createMission({
        name: (args.name as string) ?? "Untitled",
        prompt: args.prompt as string,
        profileId: args.profileId as string | undefined,
      });
      try {
        await agentBackend.dispatchMission({
          name: mission.name,
          prompt: mission.prompt,
          profileId: mission.profileId,
        });
      } catch { /* fire and forget */ }
      return { mission };
    },
  },
];

// ── MCP Protocol Handlers ───────────────────────────────────

async function handleRequest(req: MCPRequest): Promise<MCPResponse> {
  try {
    switch (req.method) {
      case "initialize": {
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "control-hub", version: "1.0.0" },
          },
        };
      }

      case "tools/list": {
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: {
            tools: TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        };
      }

      case "tools/call": {
        const { name, arguments: args = {} } = req.params as {
          name: string;
          arguments?: Record<string, unknown>;
        };
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) {
          return {
            jsonrpc: "2.0",
            id: req.id,
            error: { code: -32602, message: `Unknown tool: ${name}` },
          };
        }
        const result = await tool.handler(args);
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        };
      }

      case "ping": {
        return { jsonrpc: "2.0", id: req.id, result: {} };
      }

      default:
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        };
    }
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id: req.id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : "Internal error",
      },
    };
  }
}

// ── Message Loop ────────────────────────────────────────────

let buffer = "";

stdin.setEncoding("utf-8");

stdin.on("data", async (chunk: string) => {
  buffer += chunk;

  // Process complete JSON-RPC messages (newline-delimited)
  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const req = JSON.parse(trimmed) as MCPRequest;
      const response = await handleRequest(req);
      stdout.write(JSON.stringify(response) + "\\n");
    } catch {
      // Malformed JSON — send error
      const errorResponse: MCPResponse = {
        jsonrpc: "2.0",
        id: 0,
        error: { code: -32700, message: "Parse error" },
      };
      stdout.write(JSON.stringify(errorResponse) + "\\n");
    }
  }
});

stdin.on("end", () => {
  process.exit(0);
});
