// ═══════════════════════════════════════════════════════════════
// Hermes Kanban Board Page
// ═══════════════════════════════════════════════════════════════
// Full-featured Control Hub wrapper around the Hermes kanban system.
// Features: 7-column board, drag-and-drop, inline create, search,
// assignee/status/tenant filters, archived toggle, specify triage,
// board switcher, nudge dispatcher, SSE-backed live polling.
// ═══════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Kanban, Plus } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import HermesKanbanBoard from "@/components/hermes-kanban/HermesKanbanBoard";
import HermesKanbanToolbar from "@/components/hermes-kanban/HermesKanbanToolbar";
import HermesKanbanDrawer from "@/components/hermes-kanban/HermesKanbanDrawer";
import HermesKanbanCreateModal from "@/components/hermes-kanban/HermesKanbanCreateModal";
import HermesKanbanEmptyState from "@/components/hermes-kanban/HermesKanbanEmptyState";
import {
  CardSelectionProvider,
  useCardSelection,
} from "@/components/hermes-kanban/CardSelectionContext";
import {
  BatchActionToolbar,
  type BatchOperationPayload,
} from "@/components/hermes-kanban/BatchActionToolbar";

interface KanbanTask {
  id: string;
  title: string;
  body: string | null;
  assignee: string | null;
  status: string;
  priority: number;
  tenant: string | null;
  created_at: number;
  updated_at: number;
  result: string | null;
  max_runtime_seconds: number | null;
  skills: string | null;
  spawn_failures?: number;
  consecutive_failures?: number;
  workspace_kind?: string | null;
}

interface KanbanTaskDetail extends KanbanTask {
  comments: Array<{ id: number; author: string; body: string; created_at: number }>;
  parents: string[];
  children: string[];
  runs: Array<{ id: number; profile: string | null; outcome: string | null; summary: string | null; metadata: string | null; started_at: number; ended_at: number | null; error: string | null }>;
  events: Array<{ id: number; kind: string; payload: string | null; created_at: number }>;
  summary: string | null;
  created_by: string | null;
  spawn_failures: number;
  consecutive_failures: number;
  max_retries: number | null;
  claim_expires_at: number | null;
  max_runtime_seconds: number | null;
  skills: string | null;
  workspace_kind: string | null;
  workspace_path: string | null;
  result: string | null;
}

interface BoardOption {
  slug: string;
  name: string;
}

function KanbanBoardContent() {
  const { showToast } = useToast();

  // ── State ──────────────────────────────────────────────
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [activeBoard, setActiveBoard] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<KanbanTaskDetail | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Batch action state
  const [batchLoading, setBatchLoading] = useState(false);

  // Must be called at component top-level (React hooks rule).
  // Store clearSelection in a ref so handleBatchAction (declared below) can reference it without TDZ.
  const cardSelection = useCardSelection();
  const selectedIds = cardSelection.selectedIds;
  const clearSelectionRef = useRef(cardSelection.clearSelection);
  // Keep ref updated in case clearSelection identity changes
  clearSelectionRef.current = cardSelection.clearSelection;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch helpers ──────────────────────────────────────
  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (assigneeFilter) params.set("assignee", assigneeFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (tenantFilter) params.set("tenant", tenantFilter);
    if (showArchived) params.set("include_archived", "true");
    params.set("limit", "200");
    return params;
  }, [assigneeFilter, statusFilter, tenantFilter, showArchived]);

  const fetchTasks = useCallback(async () => {
    try {
      const params = buildParams();
      const res = await fetch(`/api/orchestration/hermes-kanban?${params.toString()}`);
      const json = await res.json();
      if (json.data?.tasks) setTasks(json.data.tasks);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const fetchAssignees = useCallback(async () => {
    try {
      const res = await fetch("/api/orchestration/hermes-kanban/assignees");
      const json = await res.json();
      if (json.data) setAssignees(json.data.map((a: { profile: string }) => a.profile));
    } catch { /* ignore */ }
  }, []);

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch("/api/orchestration/hermes-kanban/board?scope=boards");
      const json = await res.json();
      if (json.data?.boards) {
        const list: BoardOption[] = json.data.boards;
        setBoards(list);
        setActiveBoard((prev) => prev || (list.length > 0 ? list[0].slug : ""));
      }
    } catch { /* ignore */ }
  }, []);

  // ── Initial load ───────────────────────────────────────
  useEffect(() => {
    fetchTasks();
    fetchAssignees();
    fetchBoards();
  }, [fetchTasks, fetchAssignees, fetchBoards]);

  // ── Poll every 10s ─────────────────────────────────────
  useEffect(() => {
    pollRef.current = setInterval(fetchTasks, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchTasks]);

  // ── Card click opens drawer ────────────────────────────
  const handleCardClick = useCallback(async (task: KanbanTask) => {
    try {
      const res = await fetch(`/api/orchestration/hermes-kanban/${task.id}`);
      const json = await res.json();
      if (json.data) setSelectedTask(json.data);
    } catch { /* ignore */ }
  }, []);

  // ── Refresh drawer detail ──────────────────────────────
  const handleDrawerUpdate = useCallback(async (id: string, _data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/orchestration/hermes-kanban/${id}`);
      const json = await res.json();
      if (json.data) setSelectedTask(json.data);
    } catch { /* ignore */ }
    fetchTasks();
  }, [fetchTasks]);

  // ── Create task ────────────────────────────────────────
  const handleCreateTask = useCallback(async (data: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/orchestration/hermes-kanban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) {
        showToast("Task created successfully", "success");
        setShowCreateModal(false);
        fetchTasks();
      } else {
        showToast(json.error || "Failed to create task", "error");
      }
    } catch {
      showToast("Failed to create task", "error");
    }
  }, [showToast, fetchTasks]);

  // ── Inline create ──────────────────────────────────────
  const handleInlineCreate = useCallback(async (status: string, title: string) => {
    try {
      const res = await fetch("/api/orchestration/hermes-kanban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, status }),
      });
      if (res.ok) {
        // Hermes CLI only supports --triage, no --status flag.
        // Triage -> lands in triage column; all others -> lands in "ready" (CLI default)
        const landed = status === "triage" ? "triage" : "ready";
        const needsMove = status !== "triage" && status !== "ready";
        if (needsMove) {
          showToast(`Task created in ${landed} — open the drawer to set status to ${status}`, "success");
        } else {
          showToast(`Task created in ${landed}`, "success");
        }
        fetchTasks();
      }
    } catch {
      showToast("Failed to create task", "error");
    }
  }, [showToast, fetchTasks]);

  // ── Drag-and-drop between columns ──────────────────────
  const handleDropCard = useCallback(async (taskId: string, newStatus: string) => {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
    );

    try {
      const base = `/api/orchestration/hermes-kanban/${taskId}`;
      let res: Response | null = null;

      if (newStatus === "done" || newStatus === "completed") {
        res = await fetch(`${base}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } else if (newStatus === "blocked") {
        res = await fetch(`${base}/block`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Moved via drag-and-drop" }),
        });
      } else if (newStatus === "archived") {
        res = await fetch(base, { method: "DELETE" });
      } else if (newStatus === "triage" || newStatus === "todo" || newStatus === "ready") {
        // Pre-dispatcher statuses: update directly via PATCH status endpoint
        res = await fetch(base, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
      } else if (newStatus === "running") {
        // Don't allow manual transition to running (dispatcher handles it)
        showToast("Use the dispatcher to put tasks in Running", "info");
        fetchTasks();
        return;
      } else {
        showToast(`Unknown status: ${newStatus}`, "info");
        fetchTasks();
        return;
      }

      if (!res || !res.ok) {
        const json = res ? await res.json().catch(() => ({})) : {};
        showToast(json.error || `Failed to move to ${newStatus}`, "error");
        fetchTasks(); // revert optimistic update
      }
    } catch {
      fetchTasks(); // revert on error
    }
  }, [showToast, fetchTasks]);

  // ── Specify all triage tasks ──────────────────────────
  const handleSpecifyAllTriage = useCallback(async () => {
    const triageTasks = tasks.filter((t) => t.status === "triage");
    if (triageTasks.length === 0) {
      showToast("No triage tasks to specify", "info");
      return;
    }
    showToast(`Specifying ${triageTasks.length} triage tasks...`, "info");
    for (const t of triageTasks) {
      try {
        await fetch(`/api/orchestration/hermes-kanban/${t.id}/specify`, {
          method: "POST",
        });
      } catch { /* continue with next */ }
    }
    setTimeout(fetchTasks, 2000);
  }, [tasks, showToast, fetchTasks]);

  // ── Nudge dispatcher ──────────────────────────────────
  const handleNudge = useCallback(async () => {
    try {
      const res = await fetch("/api/orchestration/hermes-kanban/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        showToast("Dispatcher nudged", "success");
        setTimeout(fetchTasks, 2000);
      } else {
        const json = await res.json();
        showToast(json.error || "Failed to nudge dispatcher", "error");
      }
    } catch {
      showToast("Failed to nudge dispatcher", "error");
    }
  }, [showToast, fetchTasks]);

  // ── Board change ───────────────────────────────────────
  const handleBoardChange = useCallback((slug: string) => {
    setActiveBoard(slug);
    showToast(`Switched to board: ${slug}`, "info");
    fetchTasks();
  }, [showToast, fetchTasks]);

  // ── Batch card actions ────────────────────────────────
  const handleBatchAction = useCallback(
    async (payload: BatchOperationPayload) => {
      setBatchLoading(true);
      try {
        const body: Record<string, unknown> = {
          cardIds: payload.selectedIds,
          operation:
            payload.type === "change-status"
              ? { type: "statusChange", status: payload.newStatus }
              : payload.type === "archive"
                ? { type: "archive" }
                : { type: "assign", userId: payload.assigneeId },
        };

        const res = await fetch("/api/orchestration/hermes-kanban/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = await res.json();

        if (!res.ok) {
          showToast(json.error || "Batch operation failed", "error");
          return;
        }

        const { successCount, failureCount, errors } = json as {
          successCount: number;
          failureCount: number;
          errors: Array<{ cardId: string; reason: string }>;
        };

        if (failureCount === 0) {
          showToast(`${successCount} card${successCount !== 1 ? "s" : ""} updated`, "success");
        } else if (successCount === 0) {
          showToast(`Failed: ${errors.map((e) => e.reason).join("; ")}`, "error");
        } else {
          // partial success — show detailed per-card errors
          const errorSummary = errors
            .slice(0, 3)
            .map((e) => `${e.cardId}: ${e.reason}`)
            .join("; ");
          const more = errors.length > 3 ? ` (+${errors.length - 3} more)` : "";
          showToast(
            `${successCount} updated, ${failureCount} failed: ${errorSummary}${more}`,
            "error"
          );
        }

        clearSelectionRef.current();
        fetchTasks();
      } catch {
        showToast("Network error — please try again", "error");
      } finally {
        setBatchLoading(false);
      }
    },
    [showToast, fetchTasks, clearSelectionRef]
  );

  // ── Local search filter ───────────────────────────────
  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.body && t.body.toLowerCase().includes(q)) ||
        (t.assignee && t.assignee.toLowerCase().includes(q)),
    );
  }, [tasks, searchQuery]);

  const selectedCount = selectedIds.size;

  // Convert assignee profile names to User objects for the BatchActionToolbar
  const batchUsers = assignees.map((profile) => ({
    id: profile,
    name: profile,
    email: `${profile}@local`,
  }));

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={Kanban}
        title="Kanban"
        subtitle="Hermes task board"
        color="purple"
        actions={
          <Button
            variant="primary"
            color="purple"
            icon={Plus}
            onClick={() => setShowCreateModal(true)}
          >
            New Task
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-white/10">
        <HermesKanbanToolbar
          search={searchQuery}
          onSearchChange={setSearchQuery}
          assigneeFilter={assigneeFilter}
          onAssigneeFilterChange={setAssigneeFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          tenantFilter={tenantFilter}
          onTenantFilterChange={setTenantFilter}
          assignees={assignees}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived(!showArchived)}
          onNudge={handleNudge}
          onSpecifyAllTriage={handleSpecifyAllTriage}
          boards={boards}
          activeBoard={activeBoard}
          onBoardChange={handleBoardChange}
          selectedCount={selectedCount}
          onClearSelection={clearSelectionRef.current}
        />
      </div>

      {/* Batch action toolbar — shown when cards are selected */}
      {selectedCount > 0 && (
        <div className="px-6 pt-3">
          <BatchActionToolbar
            selectedIds={Array.from(selectedIds)}
            users={batchUsers}
            onClearSelection={clearSelectionRef.current}
            onBatchAction={handleBatchAction}
            loading={batchLoading}
          />
        </div>
      )}

      {/* Board */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <LoadingSpinner text="Loading kanban board..." />
        ) : filteredTasks.length === 0 ? (
          <HermesKanbanEmptyState onCreateTask={() => setShowCreateModal(true)} />
        ) : (
          <HermesKanbanBoard
            tasks={filteredTasks}
            onCardClick={handleCardClick}
            onInlineCreate={handleInlineCreate}
            onDropCard={handleDropCard}
            onSpecifyAll={handleSpecifyAllTriage}
          />
        )}
      </div>

      {/* Drawer */}
      <HermesKanbanDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleDrawerUpdate}
      />

      {/* Create Modal */}
      <HermesKanbanCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        assignees={assignees}
        onCreate={handleCreateTask}
      />
    </div>
  );
}

export default function HermesKanbanPage() {
  return (
    <CardSelectionProvider>
      <KanbanBoardContent />
    </CardSelectionProvider>
  );
}
