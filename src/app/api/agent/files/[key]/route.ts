import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs";

import { resolveProfileHermesHome, buildProfileHermesPathBundle } from "@/lib/hermes-profile-paths";
import { getBehaviorFiles } from "@/lib/behavior-files";
import { logApiError } from "@/lib/api-logger";
import { resolveSafeProfileName } from "@/lib/path-security";
import { requireAuth } from "@/lib/api-auth";
import { appendAuditLine } from "@/lib/audit-log";
import { ensureDb } from "@/lib/db";
import { getProfile, updateProfileContent } from "@/lib/profiles-repository";
import { pushProfileToHermes } from "@/lib/hermes-profile-sync";

/** Resolve file path for a given key and optional profile */
function resolveFilePath(
  key: string,
  profileParam: string | null
):
  | { path: string; name: string; description: string }
  | { error: string }
  | null {
  const fileConfig = getBehaviorFiles()[key];
  if (!fileConfig) return null;

  const prof = resolveSafeProfileName(profileParam);
  if (!prof.ok) {
    return { error: prof.error };
  }
  const profile = prof.profile;

  if (profile === "default") {
    const entry = getBehaviorFiles()[key];
    if (!entry) return null;
    return { path: entry.path, name: entry.name, description: entry.description };
  }

  const bundle = buildProfileHermesPathBundle(profile);
  const pathMap: Record<string, string> = {
    soul: bundle.soul,
    agent: bundle.agents,
    user: bundle.userMemory,
    memory: bundle.agentMemory,
    env: bundle.env,
    hermes: bundle.hermes,
    config: bundle.config,
    auth: bundle.auth,
  };

  const resolvedPath = pathMap[key];
  if (!resolvedPath) return null;

  return { path: resolvedPath, name: fileConfig.name, description: fileConfig.description };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const profile = request.nextUrl.searchParams.get("profile");
  const resolved = resolveFilePath(key, profile);

  if (!resolved) {
    return NextResponse.json(
      { error: `Unknown file key: ${key}` },
      { status: 400 }
    );
  }
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  try {
    const prof = resolveSafeProfileName(profile);
    const profileSlug = prof.ok ? prof.profile : "default";

    if (profileSlug !== "default" && (key === "soul" || key === "agent")) {
      ensureDb();
      const row = getProfile(profileSlug);
      if (row) {
        const content = key === "soul" ? row.soulMd : row.agentsMd;
        return NextResponse.json({
          data: {
            key,
            content,
            name: resolved.name,
            description: resolved.description,
            exists: content.length > 0,
            size: content.length,
            lastModified: row.updatedAt,
          },
        });
      }
    }

    if (!existsSync(resolved.path)) {
      return NextResponse.json({
        data: {
          key,
          content: "",
          name: resolved.name,
          description: resolved.description,
          exists: false,
          size: 0,
        },
      });
    }

    const content = readFileSync(resolved.path, "utf-8");
    const stats = statSync(resolved.path);
    return NextResponse.json({
      data: {
        key,
        content,
        name: resolved.name,
        description: resolved.description,
        exists: true,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
      },
    });
  } catch (error) {
    logApiError("GET /api/agent/files/[key]", `reading ${resolved.path}`, error);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const auth = requireAuth(request);
  if (auth) return auth;

  const { key } = await params;
  const profile = request.nextUrl.searchParams.get("profile");
  const resolved = resolveFilePath(key, profile);

  if (!resolved) {
    return NextResponse.json({ error: `Unknown file key: ${key}` }, { status: 400 });
  }
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { content, backup } = body;

    if (typeof content !== "string") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Ensure directory exists
    const dir = resolved.path.substring(0, resolved.path.lastIndexOf("/"));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Optional backup
    if (backup && existsSync(resolved.path)) {
      const prof = resolveSafeProfileName(profile);
      const profileHome = prof.ok ? resolveProfileHermesHome(prof.profile) : resolveProfileHermesHome("default");
      const backupDir = profileHome + "/backups";
      if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const backupName = `${key}-${ts}.md`;
      try {
        writeFileSync(backupDir + "/" + backupName, readFileSync(resolved.path, "utf-8"));
      } catch (err) {
        logApiError("PUT /api/agent/files/[key]", `backup ${resolved.path}`, err);
      }
    }

    const prof = resolveSafeProfileName(profile);
    const profileSlug = prof.ok ? prof.profile : "default";

    if (profileSlug !== "default" && (key === "soul" || key === "agent") && getProfile(profileSlug)) {
      ensureDb();
      if (key === "soul") {
        updateProfileContent(profileSlug, { soulMd: content });
      } else {
        updateProfileContent(profileSlug, { agentsMd: content });
      }
      const push = pushProfileToHermes(profileSlug);
      if (!push.success) {
        return NextResponse.json(
          { error: push.error ?? "Failed to sync profile to Hermes" },
          { status: 500 },
        );
      }
    } else {
      writeFileSync(resolved.path, content, "utf-8");
    }

    appendAuditLine({
      action: "agent.file.put",
      resource: key,
      ok: true,
    });

    return NextResponse.json({ data: { success: true, key, path: resolved.path } });
  } catch (error) {
    logApiError("PUT /api/agent/files/[key]", `writing ${resolved.path}`, error);
    return NextResponse.json({ error: "Failed to write file" }, { status: 500 });
  }
}
