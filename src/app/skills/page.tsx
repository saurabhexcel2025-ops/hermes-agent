// ═══════════════════════════════════════════════════════════════
// Skills Manager — Profile-aware grid with filter + toggle
// ═══════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText, ToggleRight, ToggleLeft, Save, X, ChevronDown,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { SearchInput } from "@/components/ui/Input";
import { LoadingSpinner, EmptyState } from "@/components/ui/LoadingSpinner";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import ProfileSelector from "@/components/ui/ProfileSelector";
import {
  effectiveSkillEnabled,
  matchesSkillTab,
  type SkillFilterTab,
} from "@/lib/skills-ui";

interface Skill {
  name: string;
  category: string;
  path: string;
  description: string;
  enabled: boolean;
  size: number;
  lastModified: string;
}

interface SkillsData {
  skills: Skill[];
  categories: Record<string, Skill[]>;
  total: number;
  categoryCount: number;
  profile: string;
}

export default function SkillsPage() {
  const [data, setData] = useState<SkillsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("default");
  const [pendingToggles, setPendingToggles] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<string>("");
  const [filter, setFilter] = useState<SkillFilterTab>("all");
  const { showToast, toastElement } = useToast();

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/skills?profile=${selectedProfile}`);
      const d = await res.json();
      setData(d.data);
      setPendingToggles({});
    } catch {
      showToast("Failed to load skills", "error");
    } finally {
      setLoading(false);
    }
  }, [selectedProfile, showToast]);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  const toggleSkill = (skillName: string, currentEnabled: boolean) => {
    setPendingToggles((prev) => ({ ...prev, [skillName]: !currentEnabled }));
  };

  const saveToggles = async () => {
    if (Object.keys(pendingToggles).length === 0) return;
    setSaving(true);
    try {
      const entries = Object.entries(pendingToggles);
      for (const [skillName, enabled] of entries) {
        const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}/toggle`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: selectedProfile, enabled }),
        });
        if (!res.ok) {
          let msg = `Failed to update ${skillName}`;
          try {
            const body = await res.json();
            if (body?.error) msg = body.error as string;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
      }
      showToast(`Updated ${entries.length} skills`, "success");
      loadSkills();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save changes", "error");
    } finally {
      setSaving(false);
    }
  };

  const viewSkill = async (skill: Skill) => {
    if (expandedSkill === skill.name) {
      setExpandedSkill(null);
      setSkillContent("");
      return;
    }
    setExpandedSkill(skill.name);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.name)}?profile=${selectedProfile}`);
      const d = await res.json();
      if (!res.ok) {
        setSkillContent("// " + (d?.error || res.statusText || "Failed to load"));
        return;
      }
      setSkillContent(d.data?.content || "// No content");
    } catch {
      setSkillContent("// Failed to load content");
    }
  };

  const isSkillEnabled = (skill: Skill) =>
    effectiveSkillEnabled(skill, pendingToggles);

  const hasPendingChanges = Object.keys(pendingToggles).length > 0;
  const total = data?.skills.length || 0;
  const enabledCount = data?.skills.filter((s) => isSkillEnabled(s)).length || 0;
  const disabledCount = total - enabledCount;

  const filteredSkills = (data?.skills || []).filter((s) => {
    const matchesSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = matchesSkillTab(filter, s, pendingToggles);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-dark-950 grid-bg">
      {toastElement}
      <PageHeader
        icon={FileText}
        title="Skills Manager"
        subtitle={
          filter !== "all"
            ? `${filteredSkills.length} of ${total} skills`
            : `${enabledCount} enabled — ${disabledCount} disabled`
        }
        color="green"
        actions={
          <div className="flex items-center gap-3">
            <ProfileSelector
              value={selectedProfile}
              onChange={(id) => setSelectedProfile(id)}
              compact={false}
            />
            {hasPendingChanges && (
              <Button
                variant="primary"
                color="green"
                size="sm"
                icon={Save}
                onClick={saveToggles}
                disabled={saving}
              >
                {saving ? "Saving..." : `Save (${Object.keys(pendingToggles).length})`}
              </Button>
            )}
          </div>
        }
      />

      <div className="px-6 py-4">
        {/* Sticky Controls Bar — stays fixed while skills grid scrolls */}
        <div className="sticky top-0 z-30 bg-dark-950/95 backdrop-blur-sm py-4 -mx-6 px-6">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px] max-w-sm">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search skills..."
                accentColor="green"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center rounded-lg border border-white/10 bg-dark-900/80 backdrop-blur p-0.5 gap-0.5">
              {(["all", "enabled", "disabled"] as SkillFilterTab[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    filter === f
                      ? "bg-neon-green/20 text-neon-green border border-neon-green/30"
                      : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  }`}
                >
                  {f === "enabled" && <ToggleRight className="w-3.5 h-3.5 text-neon-green" />}
                  {f === "disabled" && <ToggleLeft className="w-3.5 h-3.5 text-white/30" />}
                  {f === "all" && <FileText className="w-3.5 h-3.5" />}
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== "all" && (
                    <span className={`text-[10px] font-mono ${
                      filter === f ? "text-neon-green/60" : "text-white/30"
                    }`}>
                      {f === "enabled" ? enabledCount : disabledCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Skills Grid */}
        {loading ? (
          <LoadingSpinner text="Loading skills..." />
        ) : filteredSkills.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No skills found"
            description={search ? "Try a different search term" : "No skills match this filter"}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSkills.map((skill) => {
              const enabled = isSkillEnabled(skill);
              const isPending = skill.name in pendingToggles;
              const isExpanded = expandedSkill === skill.name;

              return (
                <Card
                  key={skill.name}
                  className={`relative overflow-hidden transition-all ${
                    !enabled ? "opacity-60 border-white/5" : "border-white/10"
                  } ${isPending ? "ring-1 ring-neon-green/40" : ""} ${isExpanded ? "ring-1 ring-neon-green/30" : ""}`}
                  glow={enabled ? "green" : undefined}
                  padding="none"
                >
                  {/* Accent bar */}
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl ${
                      enabled ? "bg-neon-green" : "bg-white/20"
                    }`}
                  />

                  <div className="p-3 pl-4">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-semibold text-white/80 truncate">
                            {skill.name}
                          </span>
                          {isPending && (
                            <Badge color="green" size="sm">
                              {pendingToggles[skill.name] ? "ON" : "OFF"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-white/30 font-mono mt-0.5">
                          {skill.category}
                        </p>
                      </div>

                      {/* Toggle button */}
                      <button
                        onClick={() => toggleSkill(skill.name, enabled)}
                        className="flex-shrink-0 mt-0.5"
                        title={enabled ? "Disable skill" : "Enable skill"}
                      >
                        {enabled ? (
                          <ToggleRight className="w-7 h-7 text-neon-green" />
                        ) : (
                          <ToggleLeft className="w-7 h-7 text-white/20" />
                        )}
                      </button>
                    </div>

                    {/* Description */}
                    <p
                      className="text-xs text-white/40 leading-relaxed line-clamp-2 mb-3"
                      title={skill.description}
                    >
                      {skill.description}
                    </p>

                    {/* Footer row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {enabled ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-neon-green/70">
                            <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-white/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                            Inactive
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => viewSkill(skill)}
                        className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-all ${
                          isExpanded
                            ? "border-white/20 text-white/50 bg-white/5"
                            : "border-white/10 text-white/30 hover:border-white/20 hover:text-white/60"
                        }`}
                      >
                        {isExpanded ? (
                          <>
                            <X className="w-3 h-3" /> Hide
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" /> View
                          </>
                        )}
                      </button>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <pre className="text-[11px] text-white/50 font-mono whitespace-pre-wrap max-h-48 overflow-auto leading-relaxed">
                          {skillContent || "// Loading..."}
                        </pre>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
