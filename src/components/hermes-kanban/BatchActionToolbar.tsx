// ═══════════════════════════════════════════════════════════════
// Batch Action Toolbar — Floating action bar shown when cards
// are selected. Change Status, Archive, and Assign actions are
// wired to the POST /api/cards/batch endpoint.
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
  const [isOpen, setIsOpen] = useState(true);
  const dropdownRef = { current: null as HTMLDivElement | null };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: "4px",
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        minWidth: "160px",
        zIndex: 1000,
        overflow: "hidden",
      }}
    >
      {STATUS_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => {
            setIsOpen(false);
            onSelect(option.value);
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "10px 16px",
            textAlign: "left",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "14px",
            color: "#374151",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = "none")
          }
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "400px",
          width: "90%",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
        }}
      >
        <h2
          style={{
            margin: "0 0 12px 0",
            fontSize: "18px",
            fontWeight: 600,
            color: "#111827",
          }}
        >
          Archive {selectedCount} {selectedCount === 1 ? "item" : "items"}?
        </h2>
        <p
          style={{
            margin: "0 0 24px 0",
            fontSize: "14px",
            color: "#6b7280",
            lineHeight: 1.5,
          }}
        >
          Archived items will be removed from your board. You can restore them
          from the archive later.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 500,
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              background: "white",
              color: "#374151",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 500,
              border: "none",
              borderRadius: "6px",
              background: "#ef4444",
              color: "white",
              cursor: "pointer",
            }}
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "480px",
          width: "90%",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
        }}
      >
        <h2
          style={{
            margin: "0 0 16px 0",
            fontSize: "18px",
            fontWeight: 600,
            color: "#111827",
          }}
        >
          Assign to user
        </h2>

        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: "14px",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            marginBottom: "16px",
            boxSizing: "border-box",
            outline: "none",
          }}
        />

        <div
          style={{
            maxHeight: "300px",
            overflowY: "auto",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          {filteredUsers.length === 0 ? (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                color: "#6b7280",
                fontSize: "14px",
              }}
            >
              No users found
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px",
                  cursor: "pointer",
                  borderBottom: "1px solid #f3f4f6",
                  background:
                    selectedUserId === user.id ? "#eff6ff" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (selectedUserId !== user.id)
                    (e.currentTarget as HTMLDivElement).style.background =
                      "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  if (selectedUserId !== user.id)
                    (e.currentTarget as HTMLDivElement).style.background =
                      "transparent";
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "#3b82f6",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>
                    {user.email}
                  </div>
                </div>
                {selectedUserId === user.id && (
                  <div
                    style={{
                      marginLeft: "auto",
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: "#3b82f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                    >
                      <polyline points="2,6 5,9 10,3" />
                    </svg>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 500,
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              background: "white",
              color: "#374151",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => selectedUserId && onSelect(selectedUserId)}
            disabled={!selectedUserId}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 500,
              border: "none",
              borderRadius: "6px",
              background: selectedUserId ? "#3b82f6" : "#9ca3af",
              color: "white",
              cursor: selectedUserId ? "pointer" : "not-allowed",
            }}
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

  const btnBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    fontSize: "13px",
    fontWeight: 500,
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "6px",
    background: loading ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
    color: loading ? "rgba(255,255,255,0.4)" : "white",
    cursor: loading ? "not-allowed" : "pointer",
    transition: "background 0.15s, color 0.15s",
  };

  return (
    <>
      <div
        role="toolbar"
        aria-label="Batch actions"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 16px",
          background: "#1f2937",
          borderRadius: "10px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "white",
            marginRight: "4px",
          }}
        >
          {loading && (
            <Loader2
              className="inline w-3 h-3 mr-1.5 animate-spin"
              style={{ verticalAlign: "middle" }}
            />
          )}
          {selectedIds.length} selected
        </span>

        {/* Change Status */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() =>
              !loading && setActiveDropdown(activeDropdown === "status" ? null : "status")
            }
            disabled={loading}
            style={btnBase}
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
          style={btnBase}
        >
          <Archive className="w-3.5 h-3.5" />
          Archive
        </button>

        {/* Assign */}
        <button
          onClick={() => !loading && setShowUserPicker(true)}
          disabled={loading}
          style={btnBase}
        >
          <User className="w-3.5 h-3.5" />
          Assign
        </button>

        <div style={{ flex: 1 }} />

        {/* Clear */}
        <button
          onClick={onClearSelection}
          disabled={loading}
          aria-label="Clear selection"
          style={{
            ...btnBase,
            background: "transparent",
            border: "none",
          }}
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
