// ═══════════════════════════════════════════════════════════════
// Kanban Column — Single status column on the board
// ═══════════════════════════════════════════════════════════════
// Supports: inline create, HTML5 drag-over highlight,
// column-specific "Specify all" for triage, drop target.

"use client";

import { useState, useCallback } from "react";
import { Plus, X, Check, Sparkles } from "lucide-react";
import HermesKanbanCard from "./HermesKanbanCard";
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
}

interface HermesKanbanColumnProps {
  status: string;
  label: string;
  color: string;
  tasks: KanbanTask[];
  onCardClick: (task: KanbanTask) => void;
  onCreateCard: (status: string, title: string) => void;
  onDropCard?: (taskId: string, newStatus: string) => void;
  onSpecifyAll?: (status: string) => void;
  /** Whether selection mode is active (board has any selected cards). */
  selectionActive?: boolean;
}

function textToBorder(textClass: string): string {
  // Handle /60 opacity
  const parts = textClass.replace("text-", "border-").split("/");
  if (parts.length === 2 && /^\d+$/.test(parts[1])) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

export default function HermesKanbanColumn({
  status,
  label,
  color,
  tasks,
  onCardClick,
  onCreateCard,
  onDropCard,
  onSpecifyAll,
  selectionActive = false,
}: HermesKanbanColumnProps) {
  const { isSelected, toggleCard, selectAll } = useCardSelection();
  const [showInlineInput, setShowInlineInput] = useState(false);
  const [inlineTitle, setInlineTitle] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const handleSubmit = () => {
    const trimmed = inlineTitle.trim();
    if (trimmed) {
      onCreateCard(status, trimmed);
      setInlineTitle("");
      setShowInlineInput(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      setShowInlineInput(false);
      setInlineTitle("");
    }
  };

  // ── Drag-and-drop handlers ──────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const taskId = e.dataTransfer.getData("text/plain");
      if (taskId && onDropCard) {
        onDropCard(taskId, status);
      }
    },
    [status, onDropCard],
  );

  const borderClass = textToBorder(color);
  const isTriage = status === "triage";

  // Select-all state: checked if all visible tasks selected, indeterminate if some
  const allIds = tasks.map((t) => t.id);
  const selectedCount = allIds.filter((id) => isSelected(id)).length;
  const selectAllChecked = tasks.length > 0 && selectedCount === tasks.length;
  const selectAllIndeterminate = selectedCount > 0 && selectedCount < tasks.length;

  const handleSelectAllChange = () => {
    if (selectAllChecked) {
      // Deselect all in this column: toggle each one off
      allIds.forEach((id) => { if (isSelected(id)) toggleCard(id); });
    } else {
      // Select all in this column
      selectAll(allIds);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        flex flex-col bg-white/[0.02] border rounded-xl min-w-[280px] max-w-[320px] flex-shrink-0 border-t-2
        transition-colors duration-150
        ${borderClass}/50
        ${isDragOver ? "border-neon-cyan/60 bg-white/5 ring-2 ring-neon-cyan/20" : ""}
      `}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${color}`} />
          <h3 className="text-sm font-semibold text-white/80">{label}</h3>
          <span className="text-xs font-mono text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
            {tasks.length}
          </span>
          {/* WIP limit indicator — configurable defaults */}
          {(() => {
            const wipLimit = status === "running" ? 5 : status === "blocked" ? 8 : null;
            if (wipLimit === null || tasks.length === 0) return null;
            const isOverWip = tasks.length > wipLimit;
            return (
              <span className={`text-[10px] font-mono ml-1 px-1 py-0.5 rounded ${
                isOverWip
                  ? "bg-neon-red/20 text-neon-red"
                  : "bg-white/5 text-white/20"
              }`}>
                {tasks.length}/{wipLimit}
              </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-1">
          {/* Select-all checkbox — shown when selection is active */}
          {(selectionActive || selectedCount > 0) && tasks.length > 0 && (
            <input
              type="checkbox"
              checked={selectAllChecked}
              ref={(el) => { if (el) el.indeterminate = selectAllIndeterminate; }}
              onChange={handleSelectAllChange}
              className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-neon-cyan cursor-pointer
                focus:ring-neon-cyan/40 focus:ring-1 focus:outline-none
                accent-neon-cyan shrink-0"
              title={`Select all ${label} tasks`}
            />
          )}
          {/* Specify all button — triage column only */}
          {onSpecifyAll && isTriage && tasks.length > 0 && (
            <button
              onClick={() => onSpecifyAll(status)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-neon-purple/20 text-neon-purple/50 hover:text-neon-purple transition-colors"
              title="Specify all triage tasks with LLM"
            >
              <Sparkles className="w-3 h-3" />
            </button>
          )}
          {/* Inline create — only for statuses that the Hermes CLI actually supports at creation */}
          {(status === "triage" || status === "todo" || status === "ready") && (
            <button
              onClick={() => setShowInlineInput(true)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors"
              title={`Create task in ${label}`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Inline create input */}
      {showInlineInput && (
        <div className="px-3 pt-2">
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
            <input
              type="text"
              value={inlineTitle}
              onChange={(e) => setInlineTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Task title..."
              className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none font-mono"
              autoFocus
            />
            <button
              onClick={handleSubmit}
              disabled={!inlineTitle.trim()}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-neon-green/20 text-neon-green/60 hover:text-neon-green disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setShowInlineInput(false);
                setInlineTitle("");
              }}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[calc(100vh-280px)]">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-white/20 italic">No tasks</p>
            {isDragOver && (
              <p className="text-xs text-neon-cyan/60 mt-1">Drop here</p>
            )}
          </div>
        ) : (
          tasks.map((task) => (
            <HermesKanbanCard
              key={task.id}
              task={task}
              onClick={() => onCardClick(task)}
              isSelected={isSelected(task.id)}
              onToggleSelect={() => toggleCard(task.id)}
            />
          ))
        )}
      </div>

      {/* Drop target hint at bottom */}
      {isDragOver && tasks.length > 0 && (
        <div className="px-3 pb-2">
          <div className="border-2 border-dashed border-neon-cyan/30 rounded-lg py-3 text-center">
            <span className="text-xs text-neon-cyan/50 font-mono">Drop here</span>
          </div>
        </div>
      )}
    </div>
  );
}
