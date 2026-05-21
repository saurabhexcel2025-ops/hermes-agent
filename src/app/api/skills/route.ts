import { NextRequest, NextResponse } from "next/server";

import { logApiError } from "@/lib/api-logger";
import { ensureDb } from "@/lib/db";
import { resolveEffectiveDisabledSkills } from "@/lib/effective-disabled-skills";
import { getProfile } from "@/lib/profiles-repository";
import { listSkills } from "@/lib/skills-repository";
import { skillsRootForProfile } from "@/lib/skills-config";
import { getActiveHermesHome } from "@/lib/hermes-agent-runtime";
import { resolveSafeProfileName } from "@/lib/path-security";
import { scanDiskSkillsCatalog } from "@/lib/hermes-profile-sync";
import { existsSync, statSync } from "fs";

interface Skill {
  name: string;
  category: string;
  path: string;
  description: string;
  enabled: boolean;
  size: number;
  lastModified: string;
}

export async function GET(request: NextRequest) {
  const profileParam = request.nextUrl.searchParams.get("profile") || "default";
  const refreshFromDisk = request.nextUrl.searchParams.get("refresh") === "1";
  const prof = resolveSafeProfileName(profileParam);
  if (!prof.ok) {
    return NextResponse.json({ error: prof.error }, { status: 400 });
  }
  const profile = prof.profile;

  try {
    ensureDb();
    const home = getActiveHermesHome();
    const skillsDir = skillsRootForProfile(home, profile);
    const disabled = resolveEffectiveDisabledSkills(profile, { refreshFromDisk });

    const dbSkills = listSkills();
    const dbKeys = new Set(dbSkills.map((s) => s.skillKey));
    const skills: Skill[] = dbSkills.map((row) => {
      const path = skillsDir + "/" + row.skillKey + "/SKILL.md";
      let size = row.content.length;
      let lastModified = row.updatedAt;
      if (existsSync(path)) {
        try {
          const st = statSync(path);
          size = st.size;
          lastModified = st.mtime.toISOString();
        }
        catch {
          // use db metadata
        }
      }
      const category = row.category || row.skillKey.split("/")[0] || "uncategorized";
      return {
        name: row.skillKey,
        category,
        path,
        description: row.description,
        enabled: !disabled.has(row.skillKey),
        size,
        lastModified,
      };
    });

    for (const { skillKey, path } of scanDiskSkillsCatalog()) {
      if (dbKeys.has(skillKey)) continue;
      try {
        const st = statSync(path);
        const category = skillKey.split("/")[0] || "uncategorized";
        skills.push({
          name: skillKey,
          category,
          path,
          description: "",
          enabled: !disabled.has(skillKey),
          size: st.size,
          lastModified: st.mtime.toISOString(),
        });
      }
      catch {
        // skip
      }
    }

    const categories: Record<string, Skill[]> = {};
    for (const skill of skills) {
      const cat = skill.category || "uncategorized";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(skill);
    }

    if (profile !== "default" && !getProfile(profile)) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        skills,
        categories,
        total: skills.length,
        categoryCount: Object.keys(categories).length,
        profile,
      },
    });
  }
  catch (error) {
    logApiError("GET /api/skills", "listing skills", error);
    return NextResponse.json({ error: "Failed to list skills" }, { status: 500 });
  }
}
