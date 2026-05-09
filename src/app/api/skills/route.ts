import { NextRequest, NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";

import { getActiveHermesHome } from "@/lib/hermes-agent-runtime";
import { logApiError } from "@/lib/api-logger";

interface Skill {
  name: string;
  category: string;
  path: string;
  description: string;
  enabled: boolean;
  size: number;
  lastModified: string;
}

/** Parse skills.enabled from config YAML.
 *  A skill is enabled iff it appears in skills.enabled[].
 *  If the key is absent or empty, all skills are disabled (strict default).
 */
function getEnabledSkills(configPath: string): Set<string> {
  if (!existsSync(configPath)) return new Set();
  try {
    const content = readFileSync(configPath, "utf-8");
    const lines = content.split("\n");
    let inSkills = false;
    let inEnabled = false;
    const enabled = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("skills:")) {
        inSkills = true;
        continue;
      }
      if (inSkills && !line.startsWith(" ") && trimmed) {
        inSkills = false;
        inEnabled = false;
      }
      if (inSkills && trimmed.startsWith("enabled:")) {
        inEnabled = true;
        continue;
      }
      if (inEnabled) {
        const match = trimmed.match(/^-\s*(.+)$/);
        if (match) enabled.add(match[1].trim());
        else if (!line.startsWith("  ") || (!trimmed.startsWith("-") && trimmed)) {
          inEnabled = false;
        }
      }
    }
    return enabled;
  } catch {
    return new Set();
  }
}

function scanSkills(dir: string, category: string, enabledSkills: Set<string>, hasExplicitEnabledList: boolean): Skill[] {
  const skills: Skill[] = [];
  if (!existsSync(dir)) return skills;

  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith(".")) continue;
      const fullPath = dir + "/" + item.name;

      if (item.isDirectory()) {
        const skillPath = fullPath + "/SKILL.md";
        if (existsSync(skillPath)) {
          try {
            const content = readFileSync(skillPath, "utf-8");
            const stats = statSync(skillPath);
            let description = "";
            const descMatch = content.match(/description:\s*["'](.+?)["']/);
            if (descMatch) description = descMatch[1];
            else {
              const lines = content.split("\n");
              for (const line of lines) {
                const t = line.trim();
                if (t && !t.startsWith("#") && !t.startsWith("---") && !t.startsWith("```")) {
                  description = t.substring(0, 120);
                  break;
                }
              }
            }

            // enabled = skill is in the enabled list, OR no explicit list exists (all enabled)
            const enabled = !hasExplicitEnabledList || enabledSkills.has(item.name);

            skills.push({
              name: item.name,
              category: category || "uncategorized",
              path: skillPath,
              description,
              enabled,
              size: stats.size,
              lastModified: stats.mtime.toISOString(),
            });
          } catch (error) {
            logApiError("GET /api/skills", `reading skill ${skillPath}`, error);
          }
        }

        // Always recurse into subdirectories — they may contain skill dirs at any depth.
        // If this dir itself has a SKILL.md it was already handled above.
        // If not, recurse to find nested skills (e.g. devops/agent-backup).
        skills.push(...scanSkills(fullPath, item.name, enabledSkills, hasExplicitEnabledList));
      }
    }
  } catch (error) {
    logApiError("GET /api/skills", `reading skills directory ${dir}`, error);
  }
  return skills;
}

export async function GET(request: NextRequest) {
  const profile = request.nextUrl.searchParams.get("profile") || "default";

  try {
    // Determine config path
    let configPath: string;
    if (profile === "default") {
      configPath = getActiveHermesHome() + "/config.yaml";
    } else {
      configPath = getActiveHermesHome() + "/profiles/" + profile + "/config.yaml";
    }

    // Determine skills directory — fall back to global when profile-specific dir is absent
    let skillsDir: string;
    if (profile === "default") {
      skillsDir = getActiveHermesHome() + "/skills";
    } else {
      const profileSkillsDir = getActiveHermesHome() + "/profiles/" + profile + "/skills";
      if (existsSync(profileSkillsDir)) {
        skillsDir = profileSkillsDir;
      } else {
        // Profile skill mirror deleted — use global skills directory
        skillsDir = getActiveHermesHome() + "/skills";
      }
    }

    const enabledSkills = getEnabledSkills(configPath);
    // If enabled list is empty (key absent), treat as "all skills enabled" (backward-compatible default)
    const hasExplicitEnabledList = enabledSkills.size > 0;
    const skills = scanSkills(skillsDir, "", enabledSkills, hasExplicitEnabledList);

    // Build categories
    const categories: Record<string, Skill[]> = {};
    for (const skill of skills) {
      const cat = skill.category || "uncategorized";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(skill);
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
  } catch (error) {
    logApiError("GET /api/skills", "listing skills", error);
    return NextResponse.json({ error: "Failed to list skills" }, { status: 500 });
  }
}
