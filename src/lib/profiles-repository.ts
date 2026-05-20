// ═══════════════════════════════════════════════════════════════
// profiles-repository.ts — Agent profiles in Control Hub SQLite
// ═══════════════════════════════════════════════════════════════

import { db, inTransaction, now } from "./db";

export interface AgentProfileRow {
  slug: string;
  displayName: string;
  description: string;
  personality: string;
  configYaml: string;
  soulMd: string;
  agentsMd: string;
  seedKey: string | null;
  syncedAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbRow {
  slug: string;
  display_name: string;
  description: string;
  personality: string;
  config_yaml: string;
  soul_md: string;
  agents_md: string;
  seed_key: string | null;
  synced_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProfile(row: DbRow): AgentProfileRow {
  return {
    slug: row.slug,
    displayName: row.display_name,
    description: row.description,
    personality: row.personality,
    configYaml: row.config_yaml,
    soulMd: row.soul_md,
    agentsMd: row.agents_md,
    seedKey: row.seed_key,
    syncedAt: row.synced_at,
    syncError: row.sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS = `
  slug, display_name, description, personality, config_yaml,
  soul_md, agents_md, seed_key, synced_at, sync_error, created_at, updated_at
`;

export function listProfiles(): AgentProfileRow[] {
  const rows = db()
    .prepare(`SELECT ${SELECT_COLS} FROM agent_profiles ORDER BY display_name COLLATE NOCASE`)
    .all() as DbRow[];
  return rows.map(rowToProfile);
}

export function getProfile(slug: string): AgentProfileRow | null {
  const row = db()
    .prepare(`SELECT ${SELECT_COLS} FROM agent_profiles WHERE slug = ?`)
    .get(slug) as DbRow | undefined;
  return row ? rowToProfile(row) : null;
}

export function getProfileBySeedKey(seedKey: string): AgentProfileRow | null {
  const row = db()
    .prepare(`SELECT ${SELECT_COLS} FROM agent_profiles WHERE seed_key = ?`)
    .get(seedKey) as DbRow | undefined;
  return row ? rowToProfile(row) : null;
}

export interface UpsertProfileInput {
  slug: string;
  displayName: string;
  description?: string;
  personality?: string;
  configYaml?: string;
  soulMd?: string;
  agentsMd?: string;
  seedKey?: string | null;
}

export function upsertProfile(input: UpsertProfileInput): AgentProfileRow {
  const ts = now();
  const existing = getProfile(input.slug);
  db()
    .prepare(
      `INSERT INTO agent_profiles (
        slug, display_name, description, personality, config_yaml,
        soul_md, agents_md, seed_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        display_name = excluded.display_name,
        description = excluded.description,
        personality = excluded.personality,
        config_yaml = excluded.config_yaml,
        soul_md = excluded.soul_md,
        agents_md = excluded.agents_md,
        seed_key = COALESCE(excluded.seed_key, agent_profiles.seed_key),
        updated_at = excluded.updated_at`,
    )
    .run(
      input.slug,
      input.displayName,
      input.description ?? existing?.description ?? "",
      input.personality ?? existing?.personality ?? "technical",
      input.configYaml ?? existing?.configYaml ?? defaultConfigYaml(input.personality ?? "technical"),
      input.soulMd ?? existing?.soulMd ?? "",
      input.agentsMd ?? existing?.agentsMd ?? "",
      input.seedKey ?? existing?.seedKey ?? null,
      existing?.createdAt ?? ts,
      ts,
    );
  return getProfile(input.slug)!;
}

export function updateProfileContent(
  slug: string,
  patch: Partial<Pick<UpsertProfileInput, "displayName" | "description" | "personality" | "configYaml" | "soulMd" | "agentsMd">>,
): AgentProfileRow | null {
  const existing = getProfile(slug);
  if (!existing) return null;
  return upsertProfile({
    slug,
    displayName: patch.displayName ?? existing.displayName,
    description: patch.description ?? existing.description,
    personality: patch.personality ?? existing.personality,
    configYaml: patch.configYaml ?? existing.configYaml,
    soulMd: patch.soulMd ?? existing.soulMd,
    agentsMd: patch.agentsMd ?? existing.agentsMd,
    seedKey: existing.seedKey,
  });
}

export function renameProfileSlug(oldSlug: string, newSlug: string): AgentProfileRow | null {
  const existing = getProfile(oldSlug);
  if (!existing || oldSlug === "default") return null;
  if (getProfile(newSlug)) return null;

  return inTransaction(() => {
    db()
      .prepare(
        `INSERT INTO agent_profiles (
          slug, display_name, description, personality, config_yaml,
          soul_md, agents_md, seed_key, synced_at, sync_error, created_at, updated_at
        ) SELECT ?, display_name, description, personality, config_yaml,
          soul_md, agents_md, seed_key, NULL, NULL, created_at, ?
        FROM agent_profiles WHERE slug = ?`,
      )
      .run(newSlug, now(), oldSlug);
    db().prepare("DELETE FROM agent_profiles WHERE slug = ?").run(oldSlug);
    return getProfile(newSlug);
  });
}

export function deleteProfile(slug: string): boolean {
  if (slug === "default") return false;
  const result = db().prepare("DELETE FROM agent_profiles WHERE slug = ?").run(slug);
  return result.changes > 0;
}

export function setProfileSyncStatus(
  slug: string,
  syncedAt: string | null,
  syncError: string | null,
): void {
  db()
    .prepare(
      "UPDATE agent_profiles SET synced_at = ?, sync_error = ?, updated_at = ? WHERE slug = ?",
    )
    .run(syncedAt, syncError, now(), slug);
}

export function listSeededProfiles(): AgentProfileRow[] {
  const rows = db()
    .prepare(`SELECT ${SELECT_COLS} FROM agent_profiles WHERE seed_key IS NOT NULL`)
    .all() as DbRow[];
  return rows.map(rowToProfile);
}

export function defaultConfigYaml(personality: string): string {
  return `agent:
  personality: ${personality}
skills:
  enabled: []
`;
}
