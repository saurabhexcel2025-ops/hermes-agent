// ═══════════════════════════════════════════════════════════════
// Kanban Board — Two-row layout
// ═══════════════════════════════════════════════════════════════
// Groups columns into two logical rows:
//   Row 1 (pre-work):    Triage → To Do → Ready
//   Row 2 (in-flight):   Running → Blocked → Done
// Archived is shown via a filter toggle in the toolbar.
// Supports drag-and-drop between columns, triage "specify all",
// and board awareness.

"use client";

import { useMemo, useCallback } from "react";
import HermesKanbanColumn from "./HermesKanbanColumn";
import { useCardSelection } from "./CardSelectionContext";

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

interface HermesKanbanBoardProps {
  tasks: KanbanTask[];
  onCardClick: (task: KanbanTask) => void;
  onInlineCreate: (status: string, title: string) => void;
  onDropCard?: (taskId: string, newStatus: string) => void;
  onSpecifyAll?: (status: string) => void;
}

interface ColumnDef {
  status: string;
  label: string;
  color: string;
}

// Row 1: Pre-work stages that require effort before a task runs
const ROW1_COLUMNS: ColumnDef[] = [
  { status: "triage", label: "Triage", color: "text-neon-purple" },
  { status: "todo", label: "To Do", color: "text-neon-orange" },
  { status: "ready", label: "Ready", color: "text-neon-cyan" },
];

// Row 2: Tasks currently in-flight or completed
const ROW2_COLUMNS: ColumnDef[] = [
  { status: "running", label: "Running", color: "text-neon-green" },
  { status: "blocked", label: "Blocked", color: "text-neon-red" },
  { status: "done", label: "Done", color: "text-neon-green/60" },
  { status: "archived", label: "Archived", color: "text-white/30" },
];

const ALL_COLUMNS = [...ROW1_COLUMNS, ...ROW2_COLUMNS];

export default function HermesKanbanBoard({
  tasks,
  onCardClick,
  onInlineCreate,
  onDropCard,
  onSpecifyAll,
}: HermesKanbanBoardProps) {
  const { selectedIds } = useCardSelection();
  const selectionActive = selectedIds.size > 0;

  const groupedTasks = useMemo(() => {
    const map = new Map<string, KanbanTask[]>();
    for (const col of ALL_COLUMNS) {
      map.set(col.status, []);
    }
    for (const task of tasks) {
      const existing = map.get(task.status);
      if (existing) {
        existing.push(task);
      } else {
        // Unknown statuses fall to triage
        map.get("triage")!.push(task);
      }
    }
    return map;
  }, [tasks]);

  const handleDropCard = useCallback(
    (taskId: string, newStatus: string) => {
      if (onDropCard) {
        onDropCard(taskId, newStatus);
      }
    },
    [onDropCard],
  );

  const renderColumn = (col: ColumnDef) => (
    <HermesKanbanColumn
      key={col.status}
      status={col.status}
      label={col.label}
      color={col.color}
      tasks={groupedTasks.get(col.status) || []}
      onCardClick={onCardClick}
      onCreateCard={onInlineCreate}
      onDropCard={handleDropCard}
      onSpecifyAll={onSpecifyAll}
      selectionActive={selectionActive}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: Pre-work pipeline — Triage → To Do → Ready */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-orange" />
          <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider font-semibold">
            Pipeline — Awaiting Execution
          </span>
          <div className="flex-1 border-t border-white/5" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {ROW1_COLUMNS.map(renderColumn)}
        </div>
      </div>

      {/* Row 2: In-flight and completed — Running → Blocked → Done */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-green" />
          <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider font-semibold">
            In Flight — Execution & Results
          </span>
          <div className="flex-1 border-t border-white/5" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {ROW2_COLUMNS.map(renderColumn)}
        </div>
      </div>
    </div>
  );
}
