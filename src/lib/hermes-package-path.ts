// ═══════════════════════════════════════════════════════════════
// hermes-package-path.ts — Locate hermes-agent Python package + venv
// ═══════════════════════════════════════════════════════════════

import { existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

function norm(p: string): string {
  return p.replace(/[/\\]+$/, "");
}

function hasCronJobsModule(packageDir: string): boolean {
  return existsSync(join(packageDir, "cron", "jobs.py"));
}

/**
 * Optional override for exotic installs (see .env.example).
 */
export function getHermesAgentRootOverride(): string | null {
  const raw = process.env.HERMES_AGENT_ROOT?.trim();
  return raw ? norm(raw) : null;
}

/**
 * Candidate directories containing `cron/jobs.py`, in search order.
 */
export function listHermesAgentPackageCandidates(hermesHome: string): string[] {
  const home = norm(hermesHome);
  const override = getHermesAgentRootOverride();
  const nativeShare = join(homedir(), ".local", "share", "hermes-agent");

  const candidates: string[] = [];
  if (override) candidates.push(override);
  candidates.push(
    join(home, "hermes-agent"),
    resolve(home, "..", "hermes-agent"),
    nativeShare
  );

  const seen = new Set<string>();
  return candidates.filter((p) => {
    const key = resolve(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Resolve the hermes-agent package directory (contains `cron/jobs.py`).
 */
export function resolveHermesAgentPackage(hermesHome: string): string | null {
  for (const candidate of listHermesAgentPackageCandidates(hermesHome)) {
    if (hasCronJobsModule(candidate)) return resolve(candidate);
  }
  return null;
}

/**
 * Python interpreter for Hermes cron subprocesses.
 */
export function resolveHermesVenvPython(hermesHome: string): string {
  const fromEnv = process.env.HERMES_AGENT_VENV_PYTHON?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const pkg = resolveHermesAgentPackage(hermesHome);
  if (pkg) {
    for (const rel of ["venv/bin/python3", ".venv/bin/python3"]) {
      const p = join(pkg, rel);
      if (existsSync(p)) return p;
    }
  }

  const nativeVenv = join(homedir(), ".local", "share", "hermes-agent", "venv", "bin", "python3");
  if (existsSync(nativeVenv)) return nativeVenv;

  return "python3";
}
