// ═══════════════════════════════════════════════════════════════
// /api/tools — Tool Registry CRUD (SQLite)
// ═══════════════════════════════════════════════════════════════
// Seeds default Hermes tools on first GET. Users can enable/disable
// tools via this API. MCP tools are registered with category="mcp".

import { NextRequest, NextResponse } from "next/server";
import { requireMcApiKey, requireNotReadOnly } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { appendAuditLine } from "@/lib/audit-log";
import {
  seedTools,
  listTools,
  getTool,
  configureTool,
  createTool,
} from "@/lib/tool-registry";

// ── GET ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  // Seed on first real request (not during build page data collection)
  seedTools();

  try {
    if (id) {
      const tool = getTool(id);
      if (!tool) {
        return NextResponse.json({ error: "Tool not found" }, { status: 404 });
      }
      return NextResponse.json({ data: { tool } });
    }

    const tools = listTools();
    return NextResponse.json({ data: { tools } });
  } catch (error) {
    logApiError("GET /api/tools", id ? `tool ${id}` : "listing tools", error);
    return NextResponse.json({ error: "Failed to load tools" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ro = requireNotReadOnly();
  if (ro) return ro;
  const auth = requireMcApiKey(request);
  if (auth) return auth;

  try {
    const body = await request.json();
    const { action } = body as { action?: string };

    // ── Configure Tool (enable/disable) ───────────────────────
    if (action === "configure") {
      const { id, enabled } = body as { id?: string; enabled?: boolean };

      if (!id || enabled === undefined) {
        return NextResponse.json({ error: "id and enabled are required" }, { status: 400 });
      }

      const ok = configureTool(id, Boolean(enabled));
      if (!ok) return NextResponse.json({ error: "Tool not found" }, { status: 404 });

      const tool = getTool(id);
      appendAuditLine({ action: "tool.configure", resource: id, ok: true });
      return NextResponse.json({ data: { tool } });
    }

    // ── Register Custom Tool ─────────────────────────────────
    if (action === "register") {
      const { name, label, description, category, config } = body as {
        name?: string;
        label?: string;
        description?: string;
        category?: string;
        config?: Record<string, unknown>;
      };

      if (!name || !label) {
        return NextResponse.json({ error: "name and label are required" }, { status: 400 });
      }

      const tool = createTool({
        name: name.trim(),
        label: label.trim(),
        description: (description ?? "").trim(),
        category: (category ?? "custom") as "custom" | "core" | "platform" | "mcp",
        enabled: true,
        config: config ?? {},
      });

      appendAuditLine({ action: "tool.register", resource: tool.id, ok: true });
      return NextResponse.json({ data: { tool } }, { status: 201 });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    logApiError("POST /api/tools", "processing request", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
