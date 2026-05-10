#!/usr/bin/env node
/**
 * Discover local Hermes installs and write CH_DATA_DIR/agents.discovery.json
 * Schema version 1 — extend with more detectors later.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

function normalizeDir(d) {
  return String(d || "").replace(/[/\\]+$/, "");
}

function getChDataDir() {
  const raw = process.env.CH_DATA_DIR || process.env.CONTROL_HUB_DATA_DIR;
  if (raw && String(raw).trim()) return normalizeDir(String(raw).trim());
  return normalizeDir(join(homedir(), "control-hub", "data"));
}

function countProfiles(root) {
  const p = join(root, "profiles");
  if (!existsSync(p)) return 0;
  let n = 0;
  try {
    for (const name of readdirSync(p)) {
      if (existsSync(join(p, name, "config.yaml"))) n++;
    }
  } catch {
    return 0;
  }
  return n;
}

function countSkills(root) {
  const p = join(root, "skills");
  if (!existsSync(p)) return 0;
  let n = 0;
  function walk(dir) {
    try {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const fp = join(dir, name.name);
        if (name.isDirectory()) walk(fp);
        else if (name.name === "SKILL.md") n++;
      }
    } catch {
      /* ignore */
    }
  }
  walk(p);
  return n;
}

function isHermesRoot(dir) {
  const cfg = join(dir, "config.yaml");
  const marker = join(dir, "HERMES.md");
  if (existsSync(cfg)) {
    try {
      const s = readFileSync(cfg, "utf8");
      if (s.includes("model:") || s.includes("memory:")) return true;
    } catch {
      /* ignore */
    }
  }
  return existsSync(marker);
}

function searchRoots() {
  const roots = new Set();
  const home = homedir();
  roots.add(home);
  roots.add(join(home, ".hermes"));
  for (const sub of ["projects", "src", "code", "dev", "Documents"]) {
    const p = join(home, sub);
    if (existsSync(p)) roots.add(p);
  }
  const extra = process.env.CH_AGENT_DISCOVERY_ROOTS;
  if (extra) {
    for (const p of extra.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
      roots.add(resolve(p));
    }
  }
  return [...roots];
}

function discoverHermes() {
  /** @type {Array<Record<string, unknown>>} */
  const found = [];
  const seen = new Set();

  function consider(dir) {
    const norm = normalizeDir(dir);
    if (!norm || seen.has(norm)) return;
    if (!existsSync(norm)) return;
    seen.add(norm);
    if (isHermesRoot(norm)) {
      found.push({
        framework: "hermes",
        root: norm,
        profileCount: countProfiles(norm),
        skillCount: countSkills(norm),
        hasConfigYaml: existsSync(join(norm, "config.yaml")),
        hasHermesMd: existsSync(join(norm, "HERMES.md")),
        detectedAt: new Date().toISOString(),
      });
    }
  }

  for (const r of searchRoots()) {
    consider(r);
    if (!existsSync(r)) continue;
    try {
      for (const name of readdirSync(r, { withFileTypes: true })) {
        if (!name.isDirectory()) continue;
        if (name.name.startsWith(".")) continue;
        consider(join(r, name.name));
      }
    } catch {
      /* ignore */
    }
  }
  return found;
}

const outDir = getChDataDir();
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "agents.discovery.json");
const entries = discoverHermes();
const doc = {
  version: 1,
  generatedAt: new Date().toISOString(),
  entries,
};
writeFileSync(outPath, JSON.stringify(doc, null, 2), "utf8");
console.log(`Wrote ${entries.length} entr(y/ies) to ${outPath}`);
