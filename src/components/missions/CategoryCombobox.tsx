"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { CATEGORY_COLOR_CLASSES } from "@/lib/mission-categories";

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
}

export interface CategoryComboboxProps {
  categories: CategoryOption[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  onCreateCategory?: (name: string) => Promise<string | null>;
  disabled?: boolean;
  label?: string;
}

export default function CategoryCombobox({
  categories,
  value,
  onChange,
  onCreateCategory,
  disabled = false,
  label = "Category",
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = categories.find((c) => c.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  const canCreate =
    onCreateCategory &&
    query.trim().length > 0 &&
    !categories.some((c) => c.name.toLowerCase() === query.trim().toLowerCase());

  const handleCreate = async () => {
    if (!onCreateCategory || !query.trim()) return;
    setCreating(true);
    try {
      const id = await onCreateCategory(query.trim());
      if (id) {
        onChange(id);
        setQuery("");
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative">
      <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-1">
        {label}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-white/10 bg-dark-900/80 text-left text-sm font-mono hover:border-white/20 disabled:opacity-50"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              selected
                ? CATEGORY_COLOR_CLASSES[selected.color]?.split(" ")[0] ??
                  "bg-neon-cyan/30"
                : "bg-white/20"
            }`}
          />
          <span className="truncate text-white/80">
            {selected?.name ?? "Uncategorized"}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-dark-900 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-white/10">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or create…"
              className="w-full px-2 py-1.5 text-xs font-mono bg-dark-950 border border-white/10 rounded text-white/80"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-xs font-mono text-white/50 hover:bg-white/5"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Uncategorized
              </button>
            </li>
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-xs font-mono text-white/80 hover:bg-white/5 flex items-center gap-2"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      CATEGORY_COLOR_CLASSES[c.color]?.split(" ")[0] ??
                      "bg-neon-cyan/30"
                    }`}
                  />
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
          {canCreate && (
            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreate()}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-neon-cyan border-t border-white/10 hover:bg-neon-cyan/10 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Create &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
