import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useMissionsApi } from "@/hooks/useMissionsApi";
import type { LocalDirEntry, Mission } from "@/types/hermes";
import { normalizeLocalDirsInput } from "@/lib/local-dir-entry";
import { buildMissionPrompt, stripPromptSections } from "@/lib/build-mission-prompt";
import type { MissionFormState } from "@/components/missions/MissionCreateForm";
import type { MissionTemplate } from "@/components/missions/TemplateModals";
import {
  categoryFilterPills,
  groupTemplatesByCategory,
} from "@/lib/mission-categories";
import type { ManagedCategory } from "@/components/missions/CategoryManagerModal";

export type MissionRow = Mission & {
  cronJob?: {
    state: string;
    enabled: boolean;
    lastRun: string | null;
    lastStatus: string | null;
  };
  latestSession?: { id: string; modified: string } | null;
  /** API may return results as plural field for backward compatibility */
  results?: string;
  /** Runtime error state (not persisted in schema) */
  error?: string;
};

export interface MissionDetail {
  mission: MissionRow;
  cronJob: {
    id: string;
    name: string;
    state: string;
    enabled: boolean;
    lastRun: string | null;
    nextRun: string | null;
    lastStatus: string | null;
    schedule: string;
  } | null;
  sessions: Array<{ id: string; modified: string; size: number }>;
}

export function useMissionsPage() {
  const {
    fetchMissions,
    fetchTemplates,
    fetchMissionDetail,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
  } = useMissionsApi();
  const router = useRouter();
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [templates, setTemplates] = useState<MissionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [promptCollapsed, setPromptCollapsed] = useState(true);
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({
    successful: true,
    failed: true,
  });
  const { showToast, toastElement } = useToast();
  const templateApplied = useRef(false);
  const expandedIdRef = useRef<string | null>(null);
  const createFormRef = useRef<HTMLDivElement | null>(null);

  const scrollToCreateForm = useCallback(() => {
    requestAnimationFrame(() => {
      createFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateIcon, setTemplateIcon] = useState("Zap");
  const [templateColor, setTemplateColor] = useState("cyan");
  const [templateSaving, setTemplateSaving] = useState(false);

  const [newName, setNewName] = useState("");
  const [newInstruction, setNewInstruction] = useState("");
  const [newContext, setNewContext] = useState("");
  const [newGoals, setNewGoals] = useState("");
  const [newDispatch, setNewDispatch] = useState<"save" | "now" | "cron" | "queue">(
    "now",
  );
  const [newSchedule, setNewSchedule] = useState("every 5m");
  const [scheduleType, setScheduleType] = useState<"interval" | "wall-clock" | "post-run">("interval");
  const [scheduleStartTime, setScheduleStartTime] = useState("00:00");
  const [newMissionTime, setNewMissionTime] = useState(15);
  const [newTimeout, setNewTimeout] = useState(10);
  const [newProfile, setNewProfile] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newProvider, setNewProvider] = useState("");
  const [newLocalDirs, setNewLocalDirs] = useState<LocalDirEntry[]>([]);
  const [localDirDraft, setLocalDirDraft] = useState<LocalDirEntry>({
    path: "",
    branch: null,
  });
  const [newReferences, setNewReferences] = useState<string[]>([]);
  const [newSkills, setNewSkills] = useState<string[]>([]);
  const [referenceInput, setReferenceInput] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [missionCategoryFilter, setMissionCategoryFilter] = useState("all");
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [newCategoryId, setNewCategoryId] = useState<string | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const LAST_CATEGORY_KEY = "ch-last-mission-category";

  const formState: MissionFormState = {
    newName,
    newInstruction,
    newContext,
    newGoals,
    newDispatch,
    newSchedule,
    scheduleType,
    scheduleStartTime,
    newMissionTime,
    newTimeout,
    newProfile,
    newModel,
    newProvider,
    newLocalDirs,
    localDirDraft,
    newReferences,
    referenceInput,
    newSkills,
  };

  const setFormField = <K extends keyof MissionFormState>(
    field: K,
    value: MissionFormState[K],
  ) => {
    switch (field) {
      case "newName": setNewName(value as string); break;
      case "newInstruction": setNewInstruction(value as string); break;
      case "newContext": setNewContext(value as string); break;
      case "newGoals": setNewGoals(value as string); break;
      case "newDispatch": setNewDispatch(value as "save" | "now" | "cron" | "queue"); break;
      case "newSchedule": setNewSchedule(value as string); break;
      case "scheduleType": setScheduleType(value as "interval" | "wall-clock" | "post-run"); break;
      case "newMissionTime": setNewMissionTime(value as number); break;
      case "newTimeout": setNewTimeout(value as number); break;
      case "newProfile": setNewProfile(value as string); break;
      case "newModel": setNewModel(value as string); break;
      case "newProvider": setNewProvider(value as string); break;
      case "newLocalDirs": setNewLocalDirs(value as LocalDirEntry[]); break;
      case "localDirDraft": setLocalDirDraft(value as LocalDirEntry); break;
      case "newReferences": setNewReferences(value as string[]); break;
      case "referenceInput": setReferenceInput(value as string); break;
      case "newSkills": setNewSkills(value as string[]); break;
      case "scheduleStartTime": setScheduleStartTime(value as string); break;
    }
  };

  const buildPrompt = useCallback(() => {
    return buildMissionPrompt({
      instruction: newInstruction,
      localDirs: newLocalDirs,
      references: newReferences,
      skills: newSkills,
      context: newContext,
    });
  }, [newInstruction, newLocalDirs, newReferences, newSkills, newContext]);

  function dispatchPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      instruction: newInstruction.trim(),
      context: newContext.trim() || undefined,
      categoryId: newCategoryId,
      goals: newGoals.split("\n").filter((g) => g.trim()),
      profile: newProfile || undefined,
      profileName: newProfile || undefined,
      modelId: newModel || undefined,
      provider: newProvider || undefined,
      missionTimeMinutes: newMissionTime,
      timeoutMinutes: newTimeout,
      localDirs: newLocalDirs,
      references: newReferences,
      skills: newSkills,
      ...overrides,
    };
  }

  function resetForm() {
    setNewName("");
    setNewInstruction("");
    setNewContext("");
    setNewGoals("");
    setNewModel("");
    setNewProvider("");
    setNewLocalDirs([]);
    setLocalDirDraft({ path: "", branch: null });
    setNewReferences([]);
    setNewSkills([]);
    setShowCreate(false);
  }

  const loadCategories = useCallback(async () => {
    try {
      const list = await fetchCategories();
      setCategories(list);
    } catch (error) {
      console.error("Failed to load categories:", error);
    }
  }, [fetchCategories]);

  const handleCreateCategory = useCallback(
    async (name: string): Promise<string | null> => {
      try {
        const cat = await createCategory(name);
        if (cat?.id) {
          await loadCategories();
          showToast(`Category "${name}" created`, "success");
          return cat.id as string;
        }
        showToast("Could not create category", "error");
      } catch (error) {
        console.error("Failed to create category:", error);
        const msg =
          error instanceof Error ? error.message : "Failed to create category";
        showToast(msg, "error");
      }
      return null;
    },
    [createCategory, loadCategories, showToast],
  );

  const handleUpdateCategory = useCallback(
    async (id: string, patch: { name?: string; color?: string }) => {
      await updateCategory(id, patch);
      await loadCategories();
    },
    [updateCategory, loadCategories],
  );

  const handleDeleteCategory = useCallback(
    async (id: string, reassignToId: string | null) => {
      await deleteCategory(id, reassignToId);
      await loadCategories();
      await fetchMissions().then(setMissions);
      const loaded = await fetchTemplates();
      setTemplates(loaded);
    },
    [deleteCategory, loadCategories, fetchMissions, fetchTemplates],
  );

  const setCategoryId = useCallback((id: string | null) => {
    setNewCategoryId(id);
    if (id) {
      try {
        localStorage.setItem(LAST_CATEGORY_KEY, id);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (showCreate && !editingId) {
      try {
        const last = localStorage.getItem(LAST_CATEGORY_KEY);
        if (last && !newCategoryId) setNewCategoryId(last);
      } catch {
        // ignore
      }
    }
  }, [showCreate, editingId, newCategoryId]);

  const fetchData = useCallback(async () => {
    try {
      const list = await fetchMissions();
      setMissions(list);
    } catch (error) {
      console.error("Failed to load missions:", error);
    }

    await loadCategories();

    try {
      const loaded = await fetchTemplates();
      setTemplates(loaded);
      if (!templateApplied.current && loaded.length > 0) {
        const url = new URL(window.location.href);
        const templateId = url.searchParams.get("template");
        const compose = url.searchParams.get("compose");
        if (templateId) {
          const t = loaded.find(
            (tmpl: MissionTemplate) => tmpl.id === templateId,
          );
          if (t) {
            setNewName(t.name);
            setNewInstruction(t.instruction);
            setNewContext(t.context);
            setNewGoals(t.goals.join("\n"));
            if (t.profile) setNewProfile(t.profile);
            if (t.defaultModel) setNewModel(t.defaultModel);
            if (t.defaultProvider) setNewProvider(t.defaultProvider);
            setNewLocalDirs(
              normalizeLocalDirsInput(
                (t as MissionTemplate & { localDirs?: unknown }).localDirs,
              ),
            );
            setNewReferences(
              (t as MissionTemplate & { references?: string[] }).references ??
                [],
            );
            setNewSkills(t.suggestedSkills || []);
            const cid =
              (t as MissionTemplate & { categoryId?: string }).categoryId ??
              null;
            setNewCategoryId(cid);
            if (cid) {
              try {
                localStorage.setItem(LAST_CATEGORY_KEY, cid);
              } catch {
                // ignore
              }
            }
            setShowCreate(true);
            templateApplied.current = true;
            showToast(`Template loaded: ${t.name}`, "success");
            if (compose !== "1") {
              scrollToCreateForm();
            }
            window.history.replaceState({}, "", "/orchestration/missions");
          }
        }
      }
    } catch (error) {
      console.error("Failed to load templates:", error);
    }
  }, [fetchMissions, fetchTemplates, showToast, scrollToCreateForm, loadCategories]);

  const fetchDetail = useCallback(
    (id: string, showLoading = true) => {
      if (showLoading) setDetailLoading(true);
      fetchMissionDetail(id)
        .then((data) => {
          if (data) setDetail(data);
        })
        .catch((error) => {
          console.error("Failed to load mission detail:", error);
        })
        .finally(() => {
          if (showLoading) setDetailLoading(false);
        });
    },
    [fetchMissionDetail],
  );

  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchData().finally(() => {
      if (!cancelled) setLoading(false);
    });
    const interval = setInterval(() => {
      void fetchData();
      const id = expandedIdRef.current;
      if (id) fetchDetail(id, false);
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchData, fetchDetail]);

  useEffect(() => {
    if (expandedId) {
      setPromptCollapsed(true);
      fetchDetail(expandedId, true);
    } else {
      setDetail(null);
    }
  }, [expandedId, fetchDetail]);

  const handleCreate = async () => {
    if (!newName.trim() || !newInstruction.trim()) return;
    if (dispatching) return;
    setDispatching(true);

    try {
      if (editingId) {
        const existingMission = missions.find((m) => m.id === editingId);
        const isActive =
          existingMission &&
          (existingMission.status === "queued" ||
            existingMission.status === "dispatched");

        if (isActive) {
          showToast("Updating mission...", "info");
          const res = await fetch("/api/missions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update",
              missionId: editingId,
              name: newName,
              ...dispatchPayload({
                schedule: newDispatch === "cron" ? newSchedule : undefined,
              }),
            }),
          });
          if (res.ok) {
            showToast("Mission updated", "success");
            setEditingId(null);
            setShowCreate(false);
            fetchData();
            if (expandedId === editingId) fetchDetail(editingId);
          } else {
            showToast("Failed to update mission", "error");
          }
          setDispatching(false);
          return;
        }

        setEditingId(null);

        const res = await fetch("/api/missions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "dispatch",
            name: newName,
            ...dispatchPayload({ dispatchMode: "now" }),
          }),
        });

        if (res.ok) {
          showToast(
            "Mission re-dispatched! Returning to dashboard...",
            "success",
          );
          setDispatching(false);
          setTimeout(() => router.push("/"), 2000);
        } else {
          showToast("Failed to re-dispatch mission", "error");
          setDispatching(false);
        }
        return;
      }

      showToast("Dispatching mission...", "info");

      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dispatch",
          name: newName,
          ...dispatchPayload({
            dispatchMode: newDispatch,
            schedule: newDispatch === "cron" ? newSchedule : undefined,
          }),
        }),
      });

      if (res.ok) {
        if (newDispatch === "save" || newDispatch === "queue") {
          showToast(
            newDispatch === "save"
              ? "Mission saved as draft"
              : "Mission saved to queue",
            "success",
          );
          resetForm();
          fetchData();
          setDispatching(false);
        } else if (newDispatch === "now") {
          showToast("Mission dispatched! Returning to dashboard...", "success");
          setDispatching(false);
          setTimeout(() => router.push("/"), 2000);
        } else {
          showToast(`Mission scheduled - ${newSchedule}`, "success");
          setDispatching(false);
          setTimeout(() => router.push("/"), 2000);
        }
      } else {
        showToast("Failed to create mission", "error");
        setDispatching(false);
      }
    } catch {
      showToast("Network error — please try again", "error");
      setDispatching(false);
    }
  };

  const handleEdit = (m: MissionRow) => {
    setEditingId(m.id);
    setNewName(m.name);
    const { instruction, context } = stripPromptSections(m.prompt);
    setNewInstruction(instruction);
    setNewContext(context);
    setNewGoals(m.goals?.join("\n") ?? "");
    setNewLocalDirs(normalizeLocalDirsInput(m.localDirs));
    setLocalDirDraft({ path: "", branch: null });
    setNewReferences(m.references ?? []);
    setNewSkills(m.skills ?? []);
    setNewCategoryId(m.categoryId ?? null);

    setNewModel(m.modelId || m.model || "");
    setNewProvider(m.provider || "");
    if (m.profileName) setNewProfile(m.profileName);
    if (typeof m.missionTimeMinutes === "number") setNewMissionTime(m.missionTimeMinutes);
    if (typeof m.timeoutMinutes === "number") setNewTimeout(m.timeoutMinutes);
    if (m.schedule) {
      setNewSchedule(m.schedule);
      const s = m.schedule.trim();
      if (s.includes("*") || /^\d/.test(s)) {
        setScheduleType("wall-clock");
      } else {
        setScheduleType("interval");
      }
    } else {
      setNewSchedule("every 5m");
      setScheduleType("interval");
    }

    if (m.status === "successful" || m.status === "failed") {
      setNewDispatch("now");
    }
    setShowCreate(true);
  };

  const handleSaveAsTemplate = () => {
    if (!newInstruction.trim()) return;
    setTemplateName(newName || "");
    setTemplateDescription("");
    setTemplateIcon("Zap");
    setTemplateColor("cyan");
    setShowTemplateEditor(true);
  };

  const handleTemplateSave = async () => {
    if (!templateName.trim()) return;
    setTemplateSaving(true);
    try {
      const payload: Record<string, unknown> = editingTemplateId
        ? { action: "update", templateId: editingTemplateId }
        : { action: "create" };

      payload.name = templateName;
      payload.icon = templateIcon;
      payload.color = templateColor;
      payload.description = templateDescription;

      payload.instruction = newInstruction;
      payload.context = newContext;
      payload.goals = newGoals.split("\n").filter((g) => g.trim());
      payload.localDirs = newLocalDirs;
      payload.references = newReferences;
      payload.suggestedSkills = newSkills;
      payload.profile = newProfile;
      payload.defaultModel =
        typeof newModel === "string" && newModel.trim() !== ""
          ? newModel.trim()
          : undefined;
      payload.defaultProvider =
        typeof newProvider === "string" && newProvider.trim() !== ""
          ? newProvider.trim()
          : undefined;
      payload.timeoutMinutes = newTimeout;
      if (newCategoryId) payload.categoryId = newCategoryId;
      if (!editingTemplateId) {
        payload.dispatchMode = newDispatch;
        payload.schedule = newSchedule;
      }

      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast(
          editingTemplateId ? "Template updated!" : "Template saved!",
          "success",
        );
        setShowTemplateEditor(false);
        setEditingTemplateId(null);
        fetchData();
      } else {
        showToast("Failed to save template", "error");
      }
    } catch {
      showToast("Failed to save template", "error");
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleEditTemplate = (
    t: MissionTemplate & {
      isCustom?: boolean;
      instruction?: string;
      context?: string;
      dispatchMode?: string;
      schedule?: string;
    },
  ) => {
    setEditingTemplateId(t.id);
    setTemplateName(t.name);
    setTemplateDescription(t.description || "");
    setTemplateIcon(t.icon);
    setTemplateColor(t.color);
    applyTemplateToForm(t);
    setShowTemplateManager(false);
    setShowTemplateEditor(true);
  };

  const applyTemplateToForm = (
    t: MissionTemplate & {
      instruction?: string;
      context?: string;
      dispatchMode?: string;
      schedule?: string;
    },
  ) => {
    setNewInstruction(t.instruction || "");
    setNewContext(t.context || "");
    setNewGoals((t.goals || []).join("\n"));
    setNewProfile(t.profile || "");
    setNewModel(t.defaultModel || "");
    setNewProvider(t.defaultProvider || "");
    setNewLocalDirs(
      normalizeLocalDirsInput(
        (t as MissionTemplate & { localDirs?: unknown }).localDirs,
      ),
    );
    setLocalDirDraft({ path: "", branch: null });
    setNewReferences(
      (t as MissionTemplate & { references?: string[] }).references ?? [],
    );
    setNewSkills(t.suggestedSkills || []);
    const cid = (t as MissionTemplate & { categoryId?: string }).categoryId ?? null;
    setNewCategoryId(cid);
    const tm = (t as MissionTemplate & { timeoutMinutes?: number }).timeoutMinutes;
    if (typeof tm === "number" && Number.isFinite(tm)) {
      setNewTimeout(tm);
    }
    if (t.dispatchMode)
      setNewDispatch(t.dispatchMode as "save" | "now" | "cron");
    if (t.schedule) setNewSchedule(t.schedule);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Delete this template?")) return;
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", templateId }),
    });
    if (res.ok) {
      showToast("Template deleted", "success");
      setShowTemplateManager(false);
      fetchData();
    } else {
      const body = await res.json().catch(() => null);
      showToast(body?.error || "Failed to delete template", "error");
    }
  };
  const handleTemplateSelect = (t: MissionTemplate) => {
    setNewName(t.name);
    applyTemplateToForm(t);
    const cid = (t as MissionTemplate & { categoryId?: string }).categoryId ?? null;
    setNewCategoryId(cid);
    setShowCreate(true);
    showToast(`Template loaded: ${t.name}`, "success");
  };

  const handleDuplicateMission = (m: MissionRow) => {
    setEditingId(null);
    setNewName(`${m.name} (copy)`);
    const { instruction, context } = stripPromptSections(m.prompt);
    setNewInstruction(instruction);
    setNewContext(context);
    setNewGoals(m.goals?.join("\n") ?? "");
    setNewLocalDirs(normalizeLocalDirsInput(m.localDirs));
    setNewReferences(m.references ?? []);
    setNewSkills(m.skills ?? []);
    setNewCategoryId(m.categoryId ?? null);
    setNewModel(m.modelId || m.model || "");
    setNewProvider(m.provider || "");
    if (m.profileName) setNewProfile(m.profileName);
    if (typeof m.missionTimeMinutes === "number") {
      setNewMissionTime(m.missionTimeMinutes);
    }
    if (typeof m.timeoutMinutes === "number") setNewTimeout(m.timeoutMinutes);
    setNewDispatch("save");
    setShowCreate(true);
    showToast("Mission duplicated as draft", "success");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this mission and its cron job?")) return;
    const res = await fetch("/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", missionId: id }),
    });
    if (res.ok) {
      showToast("Mission deleted", "success");
      if (expandedId === id) setExpandedId(null);
      fetchData();
    } else {
      const body = await res.json().catch(() => null);
      showToast(body?.error || "Failed to delete mission", "error");
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this mission? The cron job will be paused.")) return;
    const res = await fetch("/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", missionId: id }),
    });
    if (res.ok) {
      showToast("Mission cancelled", "success");
      fetchData();
      if (expandedId === id) fetchDetail(id);
    } else {
      const body = await res.json().catch(() => null);
      showToast(body?.error || "Failed to cancel mission", "error");
    }
  };

  const filtered = useMemo(
    () =>
      missions.filter((m) => {
        if (filter !== "all" && m.status !== filter) return false;
        if (missionCategoryFilter !== "all") {
          if (missionCategoryFilter === "__uncategorized__") {
            if (m.categoryId) return false;
          } else if (m.categoryId !== missionCategoryFilter) {
            return false;
          }
        }
        if (
          search &&
          !m.name.toLowerCase().includes(search.toLowerCase()) &&
          !m.prompt.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [missions, filter, search, missionCategoryFilter],
  );

  const missionCounts = useMemo(
    () => ({
      active: missions.filter((m) => m.status === "queued" || m.status === "dispatched").length,
      completed: missions.filter((m) => m.status === "successful").length,
      failed: missions.filter((m) => m.status === "failed").length,
    }),
    [missions],
  );

  const templateCategoryPills = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of templates) {
      const cid =
        (t as MissionTemplate & { categoryId?: string }).categoryId ??
        "general";
      counts[cid] = (counts[cid] ?? 0) + 1;
    }
    return categoryFilterPills(categories, counts, false, 0);
  }, [templates, categories]);

  const missionCategoryPills = useMemo(() => {
    const counts: Record<string, number> = {};
    let uncategorized = 0;
    for (const m of missions) {
      if (!m.categoryId) {
        uncategorized += 1;
      } else {
        counts[m.categoryId] = (counts[m.categoryId] ?? 0) + 1;
      }
    }
    return categoryFilterPills(categories, counts, true, uncategorized);
  }, [missions, categories]);

  const filteredGrouped = useMemo(() => {
    const grouped = groupTemplatesByCategory(
      templates as Array<MissionTemplate & { categoryId?: string }>,
      categories,
    );
    if (categoryFilter === "all") return grouped;
    return grouped.filter((g) => {
      if (categoryFilter === "__uncategorized__") {
        return g.categoryId === null;
      }
      return g.categoryId === categoryFilter;
    });
  }, [templates, categoryFilter, categories]);

  return {
    toastElement,
    loading,
    missions,
    templates,
    fetchData,
    missionCounts,
    showCreate,
    setShowCreate,
    editingId,
    setEditingId,
    filter,
    setFilter,
    search,
    setSearch,
    expandedId,
    setExpandedId,
    detail,
    detailLoading,
    promptCollapsed,
    setPromptCollapsed,
    collapsedColumns,
    setCollapsedColumns,
    categoryFilter,
    setCategoryFilter,
    missionCategoryFilter,
    setMissionCategoryFilter,
    categories,
    newCategoryId,
    setNewCategoryId,
    showCategoryManager,
    setShowCategoryManager,
    loadCategories,
    handleCreateCategory,
    handleUpdateCategory,
    handleDeleteCategory,
    setCategoryId,
    templateCategoryPills,
    missionCategoryPills,
    filteredGrouped,
    filtered,
    formState,
    setFormField,
    handleCreate,
    handleSaveAsTemplate,
    dispatching,
    handleTemplateSelect,
    createFormRef,
    setShowTemplateManager,
    showTemplateManager,
    handleEditTemplate,
    handleDeleteTemplate,
    showTemplateEditor,
    setShowTemplateEditor,
    editingTemplateId,
    setEditingTemplateId,
    templateName,
    setTemplateName,
    templateDescription,
    setTemplateDescription,
    templateIcon,
    setTemplateIcon,
    templateColor,
    setTemplateColor,
    templateSaving,
    handleTemplateSave,
    newInstruction,
    setNewInstruction,
    newContext,
    setNewContext,
    newGoals,
    setNewGoals,
    newProfile,
    setNewProfile,
    newModel,
    newProvider,
    setNewModel,
    setNewProvider,
    newMissionTime,
    setNewMissionTime,
    newTimeout,
    setNewTimeout,
    newLocalDirs,
    setNewLocalDirs,
    localDirDraft,
    setLocalDirDraft,
    newReferences,
    setNewReferences,
    referenceInput,
    setReferenceInput,
    newSkills,
    setNewSkills,
    handleEdit,
    handleDelete,
    handleCancel,
    handleDuplicateMission,
    buildPrompt,
  };
}

export type MissionsPageViewModel = ReturnType<typeof useMissionsPage>;
