// ═══════════════════════════════════════════════════════════════
// /api/models/fallbacks/sync — write fallback chain + config to Hermes
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { appendAuditLine } from "@/lib/audit-log";
import { fallbackSyncPostSchema } from "@/lib/fallback-config-schema";
import {
  getFallbackConfig,
  updateFallbackConfigBatch,
} from "@/lib/fallbacks-repository";
import { syncEnabledFallbackChainToHermes } from "@/lib/fallback-sync-helpers";

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }

  const parsed = fallbackSyncPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.config && Object.keys(parsed.data.config).length > 0) {
      updateFallbackConfigBatch(parsed.data.config);
    }

    const config = getFallbackConfig();
    const result = syncEnabledFallbackChainToHermes(config);

    appendAuditLine({ action: "fallback.sync", resource: "hermes", ok: true });

    return NextResponse.json({
      data: {
        success: true,
        config,
        hermesHome: result.hermesHome,
        configPath: result.configPath,
        backupPath: result.backupPath,
      },
    });
  } catch (error) {
    logApiError("POST /api/models/fallbacks/sync", "syncing fallback to Hermes", error);
    const message = error instanceof Error ? error.message : "Failed to sync fallback";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
