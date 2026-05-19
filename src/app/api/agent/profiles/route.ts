import { NextResponse, NextRequest } from "next/server";
import { existsSync, readFileSync, statSync } from "fs";

import { getActiveHermesHome } from "@/lib/hermes-agent-runtime";
import { logApiError } from "@/lib/api-logger";
import { resolveSafeProfileName } from "@/lib/path-security";
import { requireAuth } from "@/lib/api-auth";
import { appendAuditLine } from "@/lib/audit-log";
import { ensureDb } from "@/lib/db";
import {
  listProfiles,
  upsertProfile,
  getProfile,
  defaultConfigYaml,
} from "@/lib/profiles-repository";
import {
  pushProfileToHermes,
  detectProfileDrift,
  countProfileSkills,
} from "@/lib/hermes-profile-sync";
import { buildProfileHermesPathBundle } from "@/lib/hermes-profile-paths";
import type { ApiResponse, AgentProfile, ProfileFile } from "@/types/hermes";

function loadYamlPersonality(content: string): string {
  const lines = content.split("\n");
  let inAgent = false;
  for (const line of lines) {
    if (line.trim().startsWith("agent:")) {
      inAgent = true;
      continue;
    }
    if (inAgent && !line.startsWith(" ") && line.trim()) break;
    if (inAgent && line.includes("personality:")) {
      return line.split("personality:")[1].trim().replace(/['"]/g, "") || "technical";
    }
  }
  return "technical";
}

function getProfileFilesForSlug(slug: string): ProfileFile[] {
  const bundle = buildProfileHermesPathBundle(slug);
  const fileDefs = [
    { key: "soul", name: "SOUL.md", path: bundle.soul },
    { key: "agent", name: "AGENTS.md", path: bundle.agents },
    { key: "user", name: "USER.md", path: bundle.userMemory },
    { key: "memory", name: "MEMORY.md", path: bundle.agentMemory },
  ];
  return fileDefs.map((def) => {
    const exists = existsSync(def.path);
    let size = 0;
    let lastModified: string | null = null;
    if (exists) {
      try {
        const stats = statSync(def.path);
        size = stats.size;
        lastModified = stats.mtime.toISOString();
      } catch {
        // ignore
      }
    }
    return {
      key: def.key,
      name: def.name,
      path: def.path,
      exists,
      size,
      lastModified,
    };
  });
}

function rowToApiProfile(slug: string): AgentProfile | null {
  if (slug === "default") {
    const home = getActiveHermesHome();
    const configPath = home + "/config.yaml";
    const personality = existsSync(configPath)
      ? loadYamlPersonality(readFileSync(configPath, "utf-8"))
      : "technical";
    return {
      id: "default",
      name: "Bob",
      description: "Main agent — full access to all tools and skills",
      personality,
      isDefault: true,
      isBundled: false,
      skillsCount: countProfileSkills("default"),
      toolsCount: 0,
      files: getProfileFilesForSlug("default"),
      syncStatus: "synced",
    };
  }

  const row = getProfile(slug);
  if (!row) return null;

  const drift = detectProfileDrift(slug);
  let syncStatus: AgentProfile["syncStatus"] = "synced";
  if (row.syncError) syncStatus = "error";
  else if (drift.drifted) syncStatus = "drift";

  return {
    id: row.slug,
    name: row.displayName,
    description: row.description,
    personality: row.personality,
    isDefault: false,
    isBundled: Boolean(row.seedKey),
    skillsCount: countProfileSkills(slug),
    toolsCount: 0,
    files: getProfileFilesForSlug(slug),
    syncStatus,
    syncedAt: row.syncedAt,
    syncError: row.syncError,
  };
}

export async function GET() {
  try {
    ensureDb();
    const profiles: AgentProfile[] = [];
    const defaultProfile = rowToApiProfile("default");
    if (defaultProfile) profiles.push(defaultProfile);

    for (const row of listProfiles()) {
      const api = rowToApiProfile(row.slug);
      if (api) profiles.push(api);
    }

    return NextResponse.json<ApiResponse<{ profiles: AgentProfile[] }>>({
      data: { profiles },
    });
  } catch (error) {
    logApiError("GET /api/agent/profiles", "listing profiles", error);
    return NextResponse.json({ error: "Failed to list profiles" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    ensureDb();
    const body = await request.json();
    const { name, description, cloneFrom } = body as {
      name?: string;
      description?: string;
      cloneFrom?: string;
    };

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name is required (min 2 characters)" },
        { status: 400 },
      );
    }

    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const prof = resolveSafeProfileName(slug);
    if (!prof.ok) {
      return NextResponse.json({ error: prof.error }, { status: 400 });
    }

    if (getProfile(slug)) {
      return NextResponse.json(
        { error: `Profile "${slug}" already exists` },
        { status: 409 },
      );
    }

    let soulMd =
      "# " +
      name.trim() +
      "\n\nYou are a subject matter expert. Deliver complete, high-quality work for your assigned task.\n";
    let agentsMd = "# " + name.trim() + " — Development Guide\n\n";
    let configYaml = defaultConfigYaml("technical");
    let personality = "technical";

    if (cloneFrom && cloneFrom !== "default") {
      const source = getProfile(cloneFrom);
      if (source) {
        soulMd = source.soulMd;
        agentsMd = source.agentsMd;
        configYaml = source.configYaml;
        personality = source.personality;
      }
    }

    upsertProfile({
      slug,
      displayName: name.trim(),
      description: typeof description === "string" ? description : "",
      personality,
      configYaml,
      soulMd,
      agentsMd,
    });

    const push = pushProfileToHermes(slug);
    if (!push.success) {
      return NextResponse.json(
        { error: push.error ?? "Failed to sync profile to Hermes" },
        { status: 500 },
      );
    }

    appendAuditLine({
      action: "agent.profile.create",
      resource: slug,
      ok: true,
    });

    return NextResponse.json<ApiResponse<{ slug: string }>>({
      data: { slug },
    });
  } catch (error) {
    logApiError("POST /api/agent/profiles", "creating profile", error);
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }
}
