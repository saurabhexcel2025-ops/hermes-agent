/**
 * Git branch names for deploy / version checks.
 * Same rules on client (Sidebar) and server (POST /api/update) — no shell metacharacters.
 */

export const MAX_DEPLOY_GIT_BRANCH_LEN = 200;

export function sanitizeGitBranch(raw: string): string {
  const s = raw.replace(/[^a-zA-Z0-9._/-]/g, "").slice(0, MAX_DEPLOY_GIT_BRANCH_LEN);
  return s || "dev";
}
