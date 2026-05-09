import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";

import { getActiveHermesHome } from "@/lib/hermes-agent-runtime";
import { logApiError } from "@/lib/api-logger";
import { requireMcApiKey, requireNotReadOnly } from "@/lib/api-auth";
import { resolveSafeProfileName } from "@/lib/path-security";

// PUT — Toggle a skill on/off for a profile
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  // Authentication checks
  const ro = requireNotReadOnly();
  if (ro) return ro;
  const auth = requireMcApiKey(request);
  if (auth) return auth;

  const { name } = await params;

  try {
    const body = await request.json();
    const { profile: profileParam, enabled } = body;

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400 });
    }

    // Validate profile name
    const profileResult = resolveSafeProfileName(profileParam);
    if (!profileResult.ok) {
      return NextResponse.json({ error: profileResult.error }, { status: 400 });
    }
    const profile = profileResult.profile;

    let configPath: string;
    if (profile === "default") {
      configPath = getActiveHermesHome() + "/config.yaml";
    } else {
      configPath = getActiveHermesHome() + "/profiles/" + profile + "/config.yaml";
    }

    if (!existsSync(configPath)) {
      return NextResponse.json({ error: "Profile config not found" }, { status: 404 });
    }

    // ── Read current skills.enabled from YAML ──────────────────────────────────
    const content = readFileSync(configPath, "utf-8");
    const lines = content.split("\n");
    let inSkills = false;
    let inEnabled = false;
    let enabledStart = -1;
    let enabledEnd = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (trimmed.startsWith("skills:")) {
        inSkills = true;
        continue;
      }
      if (inSkills && !lines[i].startsWith(" ") && trimmed) {
        inSkills = false;
      }
      if (inSkills && trimmed.startsWith("enabled:")) {
        inEnabled = true;
        enabledStart = i;
        continue;
      }
      if (inEnabled) {
        if (!lines[i].startsWith("  ") || (!trimmed.startsWith("-") && trimmed)) {
          enabledEnd = i;
          inEnabled = false;
        }
      }
    }
    if (inEnabled && enabledEnd === -1) enabledEnd = lines.length;

    // Parse current enabled list
    const currentEnabled: string[] = [];
    if (enabledStart >= 0 && enabledEnd > enabledStart) {
      for (let i = enabledStart + 1; i < enabledEnd; i++) {
        const match = lines[i].trim().match(/^-\s*(.+)$/);
        if (match) currentEnabled.push(match[1].trim());
      }
    }

    // ── Update the list ────────────────────────────────────────────────────────
    // Toggle ON  → add skill to enabled list (if not already there)
    // Toggle OFF → remove skill from enabled list
    const newEnabled = enabled
      ? currentEnabled.includes(name)
        ? currentEnabled
        : [...currentEnabled, name].sort()
      : currentEnabled.filter((s) => s !== name);

    // Build YAML representation
    const newEnabledYaml = newEnabled.length > 0
      ? "  enabled:\n" + newEnabled.map((s) => "    - " + s).join("\n") + "\n"
      : "";

    if (enabledStart >= 0 && enabledEnd > enabledStart) {
      // Replace existing enabled block
      lines.splice(enabledStart, enabledEnd - enabledStart, ...newEnabledYaml.trimEnd().split("\n"));
    } else {
      // No enabled block — find or create skills: section and insert
      let insertAt = lines.length;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("skills:")) {
          insertAt = i + 1;
          break;
        }
      }
      if (insertAt === lines.length) {
        lines.push("skills:");
      }
      if (newEnabledYaml) {
        lines.splice(insertAt, 0, ...newEnabledYaml.trimEnd().split("\n"));
      }
    }

    const { writeFileSync } = await import("fs");
    writeFileSync(configPath, lines.join("\n"));

    return NextResponse.json({
      data: { success: true, skill: name, profile, enabled },
    });
  } catch (error) {
    logApiError("PUT /api/skills/[name]/toggle", "toggling skill", error);
    return NextResponse.json({ error: "Failed to toggle skill" }, { status: 500 });
  }
}
