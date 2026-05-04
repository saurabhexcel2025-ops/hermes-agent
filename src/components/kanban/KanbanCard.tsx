// ═══════════════════════════════════════════════════════════════
// KanbanCard — Individual draggable card within a Kanban column
// ═══════════════════════════════════════════════════════════════

"use client";

import { useState } from "react";
import {
  GripVertical,
  MessageSquare,
  Zap,
  User,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit3,
  Play,
} from "lucide-react";
import type { KanbanCard as KanbanCardType, KanbanCardStatus, GoalSession } from "@/types/hermes";

interface Props {
  card: KanbanCardType;
  goalSession?: GoalSession | null;
  onClick: () => void;
  onDelete: () => void;
  onStartGoalLoop?: () => void;
  hasActiveGoalLoop?: boolean;
}

const STATUS_COLORS: Record<KanbanCardStatus, string> = {
  backlog: "border-white/20",
  todo: "border-neon-orange/40",
  in_progress: "border-neon-purple/50",
  review: "border-neon-pink/50",
  done: "border-neon-green/50",
  blocked: "border-red-500/60",
};

const STATUS_LABELS: Record<KanbanCardStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

export default function KanbanCard({
  card,
  goalSession,
  onClick,
  onDelete,
  onStartGoalLoop,
  hasActiveGoalLoop,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const completedGoals = goalSession
    ? goalSession.steps.filter((s) => s.status === "done").length
    : 0;
  const totalGoals = goalSession?.steps.length ?? 0;
  const goalProgress = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0;

  return (
    <div
      className={`group relative rounded-lg border bg-dark-800/60 p-3 cursor-pointer
        hover:bg-dark-700/80 transition-colors
        ${STATUS_COLORS[card.status] ?? "border-white/10"}`}
      onClick={onClick}
    >
      {/* Drag handle + status row */}
      <div className="flex items-start gap-2 mb-2">
        <GripVertical className="w-3.5 h-3.5 text-white/20 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white leading-snug">{card.title}</p>
        </div>
        <button
          className="text-white/30 hover:text-white/60 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Labels */}
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {card.labels.slice(0, 3).map((label) => (
            <span
              key={label}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/60"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Description preview */}
      {card.description && expanded && (
        <p className="text-xs text-white/50 mb-2 leading-relaxed">
          {card.description.length > 120
            ? card.description.slice(0, 120) + "…"
            : card.description}
        </p>
      )}

      {/* Goal progress bar */}
      {totalGoals > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-neon-purple flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Goal Loop
            </span>
            <span className="text-[10px] text-white/40">
              {completedGoals}/{totalGoals}
            </span>
          </div>
          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-neon-purple transition-all"
              style={{ width: `${goalProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer: status + assignee + actions */}
      <div className="flex items-center justify-between mt-1">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-mono
            ${card.status === "done" ? "bg-neon-green/10 text-neon-green" : ""}
            ${card.status === "in_progress" ? "bg-neon-purple/10 text-neon-purple" : ""}
            ${card.status === "blocked" ? "bg-red-500/10 text-red-400" : ""}
            ${card.status === "todo" ? "bg-neon-orange/10 text-neon-orange" : ""}
            ${card.status === "review" ? "bg-neon-pink/10 text-neon-pink" : ""}
            ${card.status === "backlog" ? "bg-white/5 text-white/30" : ""}`}
        >
          {STATUS_LABELS[card.status]}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Assignee */}
          {card.assigneeProfileId ? (
            <span className="text-[10px] text-white/40 flex items-center gap-1">
              <User className="w-3 h-3" />
              {card.assigneeProfileId}
            </span>
          ) : null}

          {/* Mission count */}
          {card.missionIds.length > 0 && (
            <span className="text-[10px] text-white/30 flex items-center gap-0.5">
              <Zap className="w-3 h-3" />
              {card.missionIds.length}
            </span>
          )}

          {/* Inline actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onStartGoalLoop && !hasActiveGoalLoop && (
              <button
                className="p-1 rounded text-neon-purple hover:bg-neon-purple/10 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartGoalLoop();
                }}
                title="Start Goal Loop"
              >
                <Play className="w-3 h-3" />
              </button>
            )}
            <button
              className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete Card"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ChevronUp import fix
import { ChevronUp } from "lucide-react";
