// ═══════════════════════════════════════════════════════════════
// hermes-paths.ts — Hermes filesystem layout from a single root
// ═══════════════════════════════════════════════════════════════

function normRoot(root: string): string {
  return root.replace(/[/\\]+$/, "");
}

/** All Hermes-relative paths for one install root (string concat for bundlers). */
export interface HermesPathBundle {
  root: string;
  env: string;
  soul: string;
  hermes: string;
  agents: string;
  skills: string;
  profiles: string;
  sessions: string;
  logs: string;
  config: string;
  backups: string;
  cronJobs: string;
  memoryDb: string;
}

export function buildHermesPathBundle(root: string): HermesPathBundle {
  const R = normRoot(root);
  return {
    root: R,
    env: R + "/.env",
    soul: R + "/SOUL.md",
    hermes: R + "/HERMES.md",
    agents: R + "/AGENTS.md",
    skills: R + "/skills",
    profiles: R + "/profiles",
    sessions: R + "/sessions",
    logs: R + "/logs",
    config: R + "/config.yaml",
    backups: R + "/backups",
    cronJobs: R + "/cron/jobs.json",
    memoryDb: R + "/memory_store.db",
  };
}
