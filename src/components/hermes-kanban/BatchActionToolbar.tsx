// ═══════════════════════════════════════════════════════════════
// Batch Action Toolbar — Floating action bar shown when cards
// are selected. Change Status, Archive, and Assign actions.
// ═══════════════════════════════════════════════════════════════

"use client";

import { useState } from "react";
import { Archive, User, ChevronDown, X, Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

export type BatchOperationType = "change-status" | "archive" | "assign";

export interface BatchOperationPayload {
  type: BatchOperationType;
  selectedIds: string[];
  newStatus?: CardStatus;
  assigneeId?: string;
}

type CardStatus = "todo" | "ready" | "running" | "blocked" | "done";

interface User {
  id: string;
  name: string;
  email: string;
}

// ── Status Dropdown ───────────────────────────────────────────

const STATUS_OPTIONS: { value: CardStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "ready", label: "Ready" },
  { value: "running", label: "Running" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

function StatusDropdown({
  onSelect,
  onClose,
}: {
  onSelect: (status: CardStatus) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-white/10 rounded-lg shadow-xl min-w-[160px] z-[1000] overflow-hidden">
      {STATUS_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => { onClose(); onSelect(option.value); }}
          className="block w-full px-4 py-2.5 text-left text-sm text-white/80 hover:bg-white/10 transition-colors border-none cursor-pointer"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Archive Confirm Dialog ────────────────────────────────────

function ArchiveConfirmDialog({
  selectedCount,
  onConfirm,
  onCancel,
}: {
  selectedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000]"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-gray-900 border border-white/10 rounded-xl p-6 max-w-[400px] w-[90%] shadow-2xl"
      >
        <h2 className="m-0 mb-3 text-lg font-semibold text-white">
          Archive {selectedCount} {selectedCount === 1 ? "item" : "items"}?
        </h2>
        <p className="m-0 mb-6 text-sm text-white/50 leading-relaxed">
          Archived items will be removed from your board. You can restore them
          from the archive later.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium border border-white/20 rounded-lg bg-transparent text-white/70 hover:bg-white/10 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium border-none rounded-lg bg-neon-red text-white hover:bg-neon-red/80 cursor-pointer transition-colors"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign User Modal ─────────────────────────────────────────

function UserPickerModal({
  users,
  onSelect,
  onClose,
}: {
  users: User[];
  onSelect: (userId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000]"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-gray-900 border border-white/10 rounded-xl p-6 max-w-[480px] w-[90%] shadow-2xl"
      >
        <h2 className="m-0 mb-4 text-lg font-semibold text-white">
          Assign to user
        </h2>

        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-lg mb-4 text-white placeholder-white/30 outline-none focus:border-neon-cyan/50 transition-colors box-border"
        />

        <div className="max-h-[300px] overflow-y-auto border border-white/10 rounded-lg mb-4">
          {filteredUsers.length === 0 ? (
            <div className="p-6 text-center text-white/40 text-sm">
              No users found
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
                className={`flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-white/5 last:border-b-0 transition-colors ${
                  selectedUserId === user.id
                    ? "bg-neon-cyan/10"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-neon-purple text-white flex items-center justify-center text-sm font-medium shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {user.name}
                  </div>
                  <div className="text-xs text-white/40 truncate">
                    {user.email}
                  </div>
                </div>
                {selectedUserId === user.id && (
                  <div className="w-5 h-5 rounded-full bg-neon-cyan flex items-center justify-center shrink-0">
                    <svg
                      width="12" height="12" viewBox="0 0 12 12"
                      fill="none" stroke="white" strokeWidth="2"
                    >
                      <polyline points="2,6 5,9 10,3" />
                    </svg>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border border-white/20 rounded-lg bg-transparent text-white/70 hover:bg-white/10 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedUserId && onSelect(selectedUserId)}
            disabled={!selectedUserId}
            className={`px-4 py-2 text-sm font-medium border-none rounded-lg transition-colors ${
              selectedUserId
                ? "bg-neon-cyan text-white hover:bg-neon-cyan/80 cursor-pointer"
                : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toolbar Component ──────────────────────────────────────────

interface BatchActionToolbarProps {
  selectedIds: string[];
  users: User[];
  onClearSelection: () => void;
  onBatchAction: (payload: BatchOperationPayload) => void;
  loading?: boolean;
}

export function BatchActionToolbar({
  selectedIds,
  users,
  onClearSelection,
  onBatchAction,
  loading = false,
}: BatchActionToolbarProps) {
  const [activeDropdown, setActiveDropdown] = useState<"status" | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);

  if (selectedIds.length === 0) {
    return null;
  }

  function handleChangeStatus(status: CardStatus) {
    setActiveDropdown(null);
    onBatchAction({
      type: "change-status",
      selectedIds,
      newStatus: status,
    });
  }

  function handleArchiveConfirm() {
    setShowArchiveConfirm(false);
    onBatchAction({
      type: "archive",
      selectedIds,
    });
  }

  function handleAssignUser(userId: string) {
    setShowUserPicker(false);
    onBatchAction({
      type: "assign",
      selectedIds,
      assigneeId: userId,
    });
  }

  return (
    <>
      <div
        role="toolbar"
        aria-label="Batch actions"
        className="flex items-center gap-2 px-4 py-3 bg-gray-800 rounded-xl shadow-lg border border-white/10"
      >
        <span className="text-sm font-semibold text-white mr-1 flex items-center gap-1.5">
          {loading && (
            <Loader2 className="inline w-3 h-3 animate-spin" style={{ verticalAlign: "middle" }} />
          )}
          {selectedIds.length} selected
        </span>

        {/* Change Status */}
        <div className="relative">
          <button
            onClick={() => !loading && setActiveDropdown(activeDropdown === "status" ? null : "status")}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-white/20 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronDown className="w-3 h-3" />
            Change Status
          </button>
          {activeDropdown === "status" && (
            <StatusDropdown
              onSelect={handleChangeStatus}
              onClose={() => setActiveDropdown(null)}
            />
          )}
        </div>

        {/* Archive */}
        <button
          onClick={() => !loading && setShowArchiveConfirm(true)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-white/20 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Archive className="w-3.5 h-3.5" />
          Archive
        </button>

        {/* Assign */}
        <button
          onClick={() => !loading && setShowUserPicker(true)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-white/20 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <User className="w-3.5 h-3.5" />
          Assign
        </button>

        <div className="flex-1" />

        {/* Clear */}
        <button
          onClick={onClearSelection}
          disabled={loading}
          aria-label="Clear selection"
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-transparent border-none text-white/50 hover:text-white/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      </div>

      {showArchiveConfirm && (
        <ArchiveConfirmDialog
          selectedCount={selectedIds.length}
          onConfirm={handleArchiveConfirm}
          onCancel={() => setShowArchiveConfirm(false)}
        />
      )}

      {showUserPicker && (
        <UserPickerModal
          users={users}
          onSelect={handleAssignUser}
          onClose={() => setShowUserPicker(false)}
        />
      )}
    </>
  );
}
