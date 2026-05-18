#!/usr/bin/env node
/**
 * Detect the local Hermes install and write CH_DATA_DIR/hermes-detection.json.
 * Resolves from HERMES_HOME / AGENT_HOME env vars, defaulting to ~/.hermes.
 */
import { existsSync, mkdirSync, readdirSync } from "fs";
import { homedir } from "os";
import { basename, join, resolve } from "path";

function normalizeDir(d) {
  return String(d || "").replace(/[/\\]+$/, "");
}

function getChDataDir() {
  const raw = process.env.CH_DATA_DIR || process.env.CONTROL_HUB_DATA_DIR;
  if (raw && String(raw).trim()) return normalizeDir(String(raw).trim());
  return normalizeDir(join(homedir(), "control-hub", "data"));
}

function getHermesHome() {
  const envHome = process.env.HERMES_HOME || process.env.AGENT_HOME;
  if (envHome && String(envHome).trim()) return normalizeDir(String(envHome).trim());
  return join(homedir(), ".hermes");
}

function isPathUnderRoot(child, root) {
  const C = resolve(child);
  const R = resolve(root);
  if (C === R) return true;
  const rel = C.slice(R.length).replace(/^[/\\]+/, "");
  return rel.length > 0 && !rel.startsWith("..") && !rel.includes("..");
}

function getHermesDefaultRoot(home) {
  const native = join(homedir(), ".hermes");
  const envPath = resolve(home);
  if (isPathUnderRoot(envPath, native)) return resolve(native);
  if (basename(resolve(envPath, "..")) === "profiles") {
    return resolve(envPath, "..", "..");
  }
  return envPath;
}

function isProfileHermesHome(home) {
  return basename(resolve(home, "..")) === "profiles";
}

function resolveHermesAgentPackage(hermesHome) {
  const override = process.env.HERMES_AGENT_ROOT?.trim();
  const candidates = [];
  if (override) candidates.push(override);
  candidates.push(
    join(hermesHome, "hermes-agent"),
    resolve(hermesHome, "..", "hermes-agent"),
    join(homedir(), ".local", "share", "hermes-agent")
  );
  const seen = new Set();
  for (const c of candidates) {
    const key = resolve(c);
    if (seen.has(key)) continue;
    seen.add(key);
    if (existsSync(join(key, "cron", "jobs.py"))) return key;
  }
  return null;
}

const home = getHermesHome();
const defaultRoot = getHermesDefaultRoot(home);
const hasConfigYaml = existsSync(join(home, "config.yaml"));
const hasHermesMd = existsSync(join(home, "HERMES.md"));
const isValidHermesRoot = hasConfigYaml || hasHermesMd;
const profileHome = isProfileHermesHome(home);
const hermesAgentPath = resolveHermesAgentPackage(home);

let profileCount = 0;
const profilesDir = join(defaultRoot, "profiles");
if (existsSync(profilesDir)) {
  try {
    for (const name of readdirSync(profilesDir)) {
      if (existsSync(join(profilesDir, name, "config.yaml"))) profileCount++;
    }
  } catch {
    /* ignore */
  }
}

const outDir = getChDataDir();
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "hermes-detection.json");
const doc = {
  version: 2,
  generatedAt: new Date().toISOString(),
  hermesHome: home,
  defaultRoot,
  isProfileHome: profileHome,
  hermesAgentPath,
  valid: isValidHermesRoot,
  profileCount,
  hasConfigYaml,
  hasHermesMd,
};

const { writeFileSync } = await import("fs");
writeFileSync(outPath, JSON.stringify(doc, null, 2), "utf8");
console.log(
  `Detected Hermes at ${home} (defaultRoot: ${defaultRoot}, valid: ${isValidHermesRoot}, profiles: ${profileCount}, agent: ${hermesAgentPath ?? "not found"})`
);
