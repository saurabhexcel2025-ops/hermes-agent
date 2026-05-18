// ═══════════════════════════════════════════════════════════════
// Card Selection Context — Global selection state for kanban cards
// ═══════════════════════════════════════════════════════════════
// Maintains a Set of selected card IDs. Provides toggle, selectAll,
// clearSelection. Wraps HermesKanbanBoard so all child components
// can consume via useCardSelection().

"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

interface CardSelectionContextValue {
  selectedIds: Set<string>;
  toggleCard: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
}

const CardSelectionContext = createContext<CardSelectionContextValue | null>(null);

export function CardSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleCard = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const value = useMemo(
    () => ({ selectedIds, toggleCard, selectAll, clearSelection, isSelected }),
    [selectedIds, toggleCard, selectAll, clearSelection, isSelected],
  );

  return (
    <CardSelectionContext.Provider value={value}>
      {children}
    </CardSelectionContext.Provider>
  );
}

export function useCardSelection(): CardSelectionContextValue {
  const ctx = useContext(CardSelectionContext);
  if (!ctx) {
    throw new Error("useCardSelection must be used inside <CardSelectionProvider>");
  }
  return ctx;
}
