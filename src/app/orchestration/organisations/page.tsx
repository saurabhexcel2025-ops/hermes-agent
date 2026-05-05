// ═══════════════════════════════════════════════════════════════
// Organisations Page — Group teams under a shared leader
// ═══════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Building2, Loader2, Trash2, Crown,
  Users, ChevronRight, X, Edit2, ArrowLeft,
  Layout,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import ProfileSelector from "@/components/ui/ProfileSelector";

// ── Types ──────────────────────────────────────────────────────

interface TeamSummary {
  id: string;
  name: string;
  description: string;
  leaderId: string;
  memberCount: number;
  boardCount: number;
}

interface Organisation {
  id: string;
  name: string;
  description: string;
  leaderId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  teams: TeamSummary[];
}

// ── API helpers ────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Create / Edit Org Modal ────────────────────────────────────

function OrgModal({
  open,
  org,
  profiles,
  onClose,
  onSaved,
}: {
  open: boolean;
  org: Organisation | null;
  profiles: AgentProfile[];
  onClose: () => void;
  onSaved: (org: Organisation) => void;
}) {
  const { showToast, toastElement } = useToast();
  const isEdit = !!org;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(org?.name ?? "");
      setDescription(org?.description ?? "");
      setLeaderId(org?.leaderId ?? "");
    }
  }, [open, org]);

  const handleSave = async () => {
    if (!name.trim() || !leaderId) return;
    setSaving(true);
    try {
      const url = isEdit ? `/api/organisations/${org!.id}` : "/api/organisations";
      const method = isEdit ? "PATCH" : "POST";
      const body = { name: name.trim(), description: description.trim(), leaderId };
      const data = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (data.error) throw new Error(data.error);
      onSaved(data);
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save organisation", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-xl border border-white/10 bg-dark-950 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-neon-purple" />
            {isEdit ? "Edit Organisation" : "New Organisation"}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-white/40 hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
              Organisation Name *
            </label>
            <input
              className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                placeholder-white/30 focus:outline-none focus:border-neon-purple/50 transition-colors"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. PatterTech Engineering"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
              Description
            </label>
            <textarea
              className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                placeholder-white/30 focus:outline-none focus:border-neon-purple/50 transition-colors resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this organisation do?"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
              <Crown className="w-3 h-3 inline mr-1 text-neon-yellow" />
              Leader *
            </label>
            <ProfileSelector
              value={leaderId}
              onChange={setLeaderId}
              placeholder="Select organisation leader…"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10 flex-shrink-0">
          <button
            className="text-sm px-4 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="text-sm px-4 py-1.5 rounded-lg bg-neon-purple/10 text-neon-purple
              hover:bg-neon-purple/20 border border-neon-purple/20 transition-colors disabled:opacity-50"
            onClick={handleSave}
            disabled={saving || !name.trim() || !leaderId}
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Organisation"}
          </button>
        </div>
        {toastElement}
      </div>
    </div>
  );
}

// ── Add Teams Modal ────────────────────────────────────────────

function AddTeamsModal({
  open,
  orgId,
  onClose,
  onTeamsChanged,
}: {
  open: boolean;
  orgId: string;
  onClose: () => void;
  onTeamsChanged: () => void;
}) {
  const { showToast, toastElement } = useToast();
  const [available, setAvailable] = useState<TeamSummary[]>([]);
  const [assigned, setAssigned] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [availRes, orgRes] = await Promise.all([
        apiFetch(`/api/organisations/${orgId}/teams/unassigned`),
        apiFetch(`/api/organisations/${orgId}`),
      ]);
      setAvailable(availRes.data?.teams ?? []);
      setAssigned(orgRes.teams ?? []);
    } catch {
      showToast("Failed to load teams", "error");
    } finally {
      setLoading(false);
    }
  }, [orgId, showToast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const toggleSelect = (teamId: string) => {
    const next = new Set(selected);
    next.has(teamId) ? next.delete(teamId) : next.add(teamId);
    setSelected(next);
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      for (const teamId of selected) {
        await apiFetch(`/api/organisations/${orgId}/teams`, {
          method: "POST",
          body: JSON.stringify({ teamId }),
        });
      }
      onTeamsChanged();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to add teams", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl border border-white/10 bg-dark-950 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-neon-purple" />
            Add Teams to Organisation
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-white/40 hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-neon-purple animate-spin" />
            </div>
          ) : available.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-6">All teams are already in this organisation.</p>
          ) : (
            <div className="space-y-2">
              {available.map((team) => (
                <button
                  key={team.id}
                  onClick={() => toggleSelect(team.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left
                    ${selected.has(team.id)
                      ? "border-neon-purple/50 bg-neon-purple/10"
                      : "border-white/10 bg-white/5 hover:bg-white/[0.07]"
                    }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                    ${selected.has(team.id) ? "bg-neon-purple border-neon-purple" : "border-white/30"}`}>
                    {selected.has(team.id) && (
                      <span className="text-[10px] text-white">✓</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{team.name}</p>
                    <p className="text-xs text-white/40">{team.memberCount} members · {team.boardCount} boards</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10 flex-shrink-0">
          <button
            className="text-sm px-4 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="text-sm px-4 py-1.5 rounded-lg bg-neon-purple/10 text-neon-purple
              hover:bg-neon-purple/20 border border-neon-purple/20 transition-colors disabled:opacity-50"
            onClick={handleAdd}
            disabled={saving || selected.size === 0}
          >
            {saving ? "Adding…" : `Add ${selected.size > 0 ? `(${selected.size})` : ""}`}
          </button>
        </div>
        {toastElement}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function OrganisationsPage() {
  const { showToast, toastElement } = useToast();
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organisation | null>(null);
  const [addingTeamsOrgId, setAddingTeamsOrgId] = useState<string | null>(null);
  const [removingTeamMap, setRemovingTeamMap] = useState<Record<string, Set<string>>>({});

  const load = useCallback(async () => {
    try {
      const [orgsRes, profilesRes] = await Promise.all([
        apiFetch("/api/organisations"),
        apiFetch("/api/agent/profiles"),
      ]);
      setOrgs(orgsRes.data ?? []);
      setProfiles(profilesRes.data?.profiles ?? []);
    } catch {
      showToast("Failed to load organisations", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const getProfileName = (profileId: string) =>
    profiles.find((p) => p.id === profileId)?.name ?? profileId;

  const handleDeleteOrg = async (orgId: string) => {
    if (!confirm("Delete this organisation? Teams will remain but be unlinked.")) return;
    try {
      await apiFetch(`/api/organisations/${orgId}`, { method: "DELETE" });
      setOrgs((prev) => prev.filter((o) => o.id !== orgId));
      showToast("Organisation deleted", "success");
    } catch {
      showToast("Failed to delete organisation", "error");
    }
  };

  const handleRemoveTeam = async (orgId: string, teamId: string) => {
    if (!confirm("Remove this team from the organisation?")) return;
    setRemovingTeamMap((prev) => ({
      ...prev,
      [orgId]: new Set([...(prev[orgId] ?? []), teamId]),
    }));
    try {
      await apiFetch(`/api/organisations/${orgId}/teams`, {
        method: "PUT",
        body: JSON.stringify({ teamId }),
      });
      setOrgs((prev) =>
        prev.map((o) =>
          o.id === orgId ? { ...o, teams: o.teams.filter((t) => t.id !== teamId) } : o
        )
      );
      showToast("Team removed from organisation", "success");
    } catch {
      showToast("Failed to remove team", "error");
    } finally {
      setRemovingTeamMap((prev) => {
        const next = { ...prev };
        next[orgId] = new Set([...next[orgId]].filter((id) => id !== teamId));
        return next;
      });
    }
  };

  const handleSaved = (savedOrg: Organisation) => {
    setOrgs((prev) => {
      const idx = prev.findIndex((o) => o.id === savedOrg.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...savedOrg };
        return updated;
      }
      return [savedOrg, ...prev];
    });
    showToast(
      editingOrg ? `Organisation updated` : `Organisation "${savedOrg.name}" created`,
      "success"
    );
    setEditingOrg(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/orchestration/teams" className="text-white/30 hover:text-white/60 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-6 h-6 text-neon-purple" />
              Organisations
            </h1>
            <p className="text-xs text-white/40 mt-0.5">
              Group your teams under a shared leader and mission
            </p>
          </div>
        </div>
        <button
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-neon-purple/30
            text-neon-purple hover:bg-neon-purple/10 transition-colors"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="w-4 h-4" />
          New Organisation
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-neon-purple animate-spin" />
        </div>
      ) : orgs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Building2 className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/50 mb-4">No organisations yet</p>
            <button
              className="text-sm px-4 py-2 rounded-lg bg-neon-purple/10 text-neon-purple
                hover:bg-neon-purple/20 border border-neon-purple/20 transition-colors"
              onClick={() => setShowCreate(true)}
            >
              Create your first organisation
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4">
          {orgs.map((org) => {
            const isExpanded = expandedId === org.id;
            return (
              <div
                key={org.id}
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.07] transition-colors overflow-hidden"
              >
                {/* Org header row */}
                <div className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-white truncate">{org.name}</h3>
                      <span className="text-xs text-white/30 font-mono">
                        {org.teams.length} team{org.teams.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {org.description && (
                      <p className="text-xs text-white/40 leading-relaxed">{org.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <Crown className="w-3 h-3 text-neon-yellow flex-shrink-0" />
                      <span className="text-xs text-white/50">Leader:</span>
                      <span className="text-xs text-white/80">{getProfileName(org.leaderId)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href="/orchestration/teams"
                      className="flex items-center gap-1 text-xs text-neon-cyan/70 hover:text-neon-cyan transition-colors"
                    >
                      <Layout className="w-3.5 h-3.5" />
                      Teams
                    </Link>
                    <button
                      className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors"
                      onClick={() => setAddingTeamsOrgId(org.id)}
                      title="Add teams"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors"
                      onClick={() => setEditingOrg(org)}
                      title="Edit organisation"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      onClick={() => handleDeleteOrg(org.id)}
                      title="Delete organisation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="p-1.5 rounded text-white/30 hover:text-white hover:bg-white/5 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : org.id)}
                    >
                      <ChevronRight
                        className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Expanded teams list */}
                {isExpanded && (
                  <div className="border-t border-white/10">
                    {org.teams.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-xs text-white/30">No teams in this organisation yet.</p>
                        <button
                          className="mt-2 text-xs text-neon-purple/70 hover:text-neon-purple transition-colors"
                          onClick={() => setAddingTeamsOrgId(org.id)}
                        >
                          + Add teams
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {org.teams.map((team) => (
                          <div
                            key={team.id}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                          >
                            <Users className="w-4 h-4 text-white/30 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white/80 truncate">{team.name}</p>
                              <p className="text-xs text-white/30">
                                {team.memberCount} members · {team.boardCount} boards
                              </p>
                            </div>
                            <Link
                              href={"/kanban?team=" + team.id}
                              className="text-xs text-neon-cyan/60 hover:text-neon-cyan transition-colors"
                            >
                              Board
                            </Link>
                            <button
                              className="text-xs text-white/30 hover:text-red-400 transition-colors"
                              onClick={() => handleRemoveTeam(org.id, team.id)}
                              disabled={removingTeamMap[org.id]?.has(team.id)}
                            >
                              {removingTeamMap[org.id]?.has(team.id) ? "…" : "Remove"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <OrgModal
        open={showCreate || !!editingOrg}
        org={editingOrg}
        profiles={profiles}
        onClose={() => { setShowCreate(false); setEditingOrg(null); }}
        onSaved={handleSaved}
      />

      {addingTeamsOrgId && (
        <AddTeamsModal
          open={true}
          orgId={addingTeamsOrgId}
          onClose={() => setAddingTeamsOrgId(null)}
          onTeamsChanged={() => {
            load();
            setAddingTeamsOrgId(null);
          }}
        />
      )}

      {toastElement}
    </div>
  );
}

// Extend AgentProfile type for local use (avoids import issues)
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface AgentProfile {
    id: string;
    name: string;
    description?: string;
    role: string;
    status: string;
  }
}
