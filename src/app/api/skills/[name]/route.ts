import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, statSync } from "fs";

import { getActiveHermesHome } from "@/lib/hermes-agent-runtime";
import { logApiError } from "@/lib/api-logger";
import { findSkillFile } from "@/lib/skills-enabled-config";
import { requireAuth } from "@/lib/api-auth";
import { appendAuditLine } from "@/lib/audit-log";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const profile = request.nextUrl.searchParams.get("profile") || "default";

  try {
    const filePath = findSkillFile(name, getActiveHermesHome(), profile);

    if (!filePath || !existsSync(filePath)) {
      return NextResponse.json(
        { error: `Skill not found: ${name}` },
        { status: 404 }
      );
    }

    const content = readFileSync(filePath, "utf-8");
    const stats = statSync(filePath);

    return NextResponse.json({
      data: {
        name,
        path: filePath,
        content,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
      },
    });
  } catch (error) {
    logApiError("GET /api/skills/[name]", `reading skill ${name}`, error);
    return NextResponse.json({ error: "Failed to read skill" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = requireAuth(request);
  if (auth) return auth;

  const { name } = await params;
  const profile = request.nextUrl.searchParams.get("profile") || "default";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content =
    typeof body === "object" && body !== null && "content" in body
      ? (body as { content: unknown }).content
      : undefined;

  if (typeof content !== "string") {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  try {
    const filePath = findSkillFile(name, getActiveHermesHome(), profile);

    if (!filePath) {
      return NextResponse.json(
        { error: `Skill not found: ${name}` },
        { status: 404 }
      );
    }

    if (existsSync(filePath)) {
      const backupPath = filePath + ".bak";
      try {
        writeFileSync(backupPath, readFileSync(filePath, "utf-8"), "utf-8");
      } catch (err) {
        logApiError("PUT /api/skills/[name]", `backup ${filePath}`, err);
      }
    }

    writeFileSync(filePath, content, "utf-8");
    const stats = statSync(filePath);

    appendAuditLine({
      action: "skill.put",
      resource: name,
      ok: true,
    });

    return NextResponse.json({
      data: {
        name,
        path: filePath,
        content,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
      },
    });
  } catch (error) {
    logApiError("PUT /api/skills/[name]", `writing skill ${name}`, error);
    return NextResponse.json({ error: "Failed to write skill" }, { status: 500 });
  }
}
