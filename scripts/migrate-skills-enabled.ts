#!/usr/bin/env node
/**
 * migrate-skills-enabled.ts
 *
 * Migrates profile config files from skills.disabled[] to skills.enabled[].
 *
 * Logic:
 *   - For each skill in ~/.hermes/skills/ (flat + subdirectory), if it is NOT in
 *     the current skills.disabled[] list, add it to skills.enabled[].
 *   - Remove the skills.disabled{} block entirely.
 *   - Create a timestamped .backup.<ts> file before modifying.
 *
 * Usage:
 *   node migrate-skills-enabled.ts [--dry-run]
 *
 * --dry-run  : print proposed changes without writing anything
 */

"use strict";

const fs = require("fs");
const path = require("path");

const HERMES_HOME = process.env.HERMES_HOME || path.join(process.env.HOME || "/home/daniel", ".hermes");

// ── Collect all skill names from ~/.hermes/skills/ ─────────────────────────────────

function collectSkillNames(skillsRoot: string) {
  const names = new Set();

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const skillMd = path.join(full, "SKILL.md");
        if (fs.existsSync(skillMd)) {
          names.add(entry.name);
        } else {
          // Recurse into category dirs
          walk(full);
        }
      }
    }
  }

  walk(skillsRoot);
  return names;
}

// ── Parse YAML helpers ────────────────────────────────────────────────────────────

/**
 * Parse the skills.disabled[] list from a config file's content string.
 * Returns a string[] of disabled skill names.
 */
function parseDisabledList(content) {
  const lines = content.split("\n");
  const disabled: string[] = [];
  let inSkills = false;
  let inDisabled = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "skills:") { inSkills = true; continue; }
    if (inSkills && !line.startsWith(" ") && trimmed) { inSkills = false; }
    if (inSkills && trimmed === "disabled:") { inDisabled = true; continue; }
    if (inDisabled) {
      const m = trimmed.match(/^-\s*(.+)$/);
      if (m) disabled.push(m[1].trim());
      else if (trimmed.startsWith("#")) { /* comment inside disabled block — skip */ }
      else if (!line.startsWith("  ") || (!trimmed.startsWith("-") && trimmed)) { inDisabled = false; }
    }
  }
  return disabled;
}

/**
 * Rewrite a config file:
 *   - Remove the entire skills.disabled{} block
 *   - Add a skills.enabled{} block with all skills NOT in disabled
 *   - If enabled list is empty (all skills were disabled), write empty enabled: []
 */
function rewriteConfig(content, allSkills, disabled) {
  const disabledSet = new Set(disabled);
  const enabled = [...allSkills].filter(s => !disabledSet.has(s)).sort();

  const lines = content.split("\n");
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Detect start of skills.disabled block
    if (trimmed === "skills:") {
      output.push(lines[i]);
      i++;
      // Look for disabled: under this skills: block
      let hitDisabled = false;
      let disabledEnd = i;
      while (disabledEnd < lines.length) {
        const t = lines[disabledEnd].trim();
        if (t === "disabled:") {
          hitDisabled = true;
          disabledEnd++;
          while (disabledEnd < lines.length) {
            const tt = lines[disabledEnd].trim();
            // Skip comment lines inside the disabled block
            if (tt.startsWith("#")) { disabledEnd++; continue; }
            // An indented - item (2+ spaces) is a list entry; break on anything else
            if (!lines[disabledEnd].startsWith("  ") || (!tt.startsWith("-") && tt)) break;
            disabledEnd++;
          }
          break;
        }
        // Any non-empty, non-2-space-indented line means we've exited the skills section
        // (skills keys use 2-space indent; only list items use more)
        if (t && !lines[disabledEnd].startsWith("  ")) break;
        disabledEnd++;
      }

      if (hitDisabled) {
        // Skip disabled block
        while (i < disabledEnd) i++;
        // Insert enabled block
        if (enabled.length > 0) {
          output.push("  enabled:");
          for (const s of enabled) {
            output.push("    - " + s);
          }
        } else {
          output.push("  enabled: []");
        }
      } else {
        // No disabled block — pass through as-is (skills: with no body, or other keys)
        output.push(lines[i]);
        i++;
      }
    } else {
      output.push(lines[i]);
      i++;
    }
  }

  return output.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────────

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const skillsRoot = path.join(HERMES_HOME, "skills");
  const profilesDir = path.join(HERMES_HOME, "profiles");

  console.log(`\n=== skills.disabled → skills.enabled Migration ===`);
  console.log(`Hermes home: ${HERMES_HOME}`);
  console.log(`Dry run: ${dryRun}\n`);

  const allSkills = collectSkillNames(skillsRoot);
  console.log(`Total skills found: ${allSkills.size}`);

  const configFiles = [
    { path: path.join(HERMES_HOME, "config.yaml"), label: "default" },
  ];

  if (fs.existsSync(profilesDir)) {
    for (const entry of fs.readdirSync(profilesDir)) {
      const full = path.join(profilesDir, entry);
      const stat = fs.statSync(full);
      if (!stat.isDirectory()) continue;
      const cfg = path.join(full, "config.yaml");
      if (fs.existsSync(cfg)) {
        configFiles.push({ path: cfg, label: entry });
      }
    }
  }

  for (const { path: cfgPath, label } of configFiles) {
    console.log(`\n--- ${label} (${cfgPath}) ---`);
    const content = fs.readFileSync(cfgPath, "utf-8");
    const disabled = parseDisabledList(content);

    if (disabled.length === 0) {
      console.log(`  No skills.disabled[] found — skipping (no migration needed)`);
      continue;
    }

    const newContent = rewriteConfig(content, allSkills, disabled);
    const backupPath = cfgPath + ".backup." + Date.now();
    const enabledCount = (Array.from(allSkills) as string[]).filter(s => !disabled.includes(s)).sort().length;

    console.log(`  Disabled: ${disabled.length} skills`);
    console.log(`  Enabled after migration: ${enabledCount} skills`);
    console.log(`  Backup: ${backupPath}`);

    if (dryRun) {
      console.log(`  [DRY RUN] Would write enabled list. No file written.`);
      // Show first 10 enabled skills
      const enabled = (Array.from(allSkills) as string[]).filter(s => !disabled.includes(s)).sort();
      console.log(`  First 10 enabled: ${enabled.slice(0, 10).join(", ")}${enabled.length > 10 ? "..." : ""}`);
    } else {
      fs.writeFileSync(backupPath, content, "utf-8");
      fs.writeFileSync(cfgPath, newContent, "utf-8");
      console.log(`  ✓ Written — backup saved`);
    }
  }

  console.log(`\n=== Done ===\n`);
}

main();
