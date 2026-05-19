"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: "right" | "bottom";
}

export default function Sheet({
  open,
  onClose,
  title,
  children,
  side = "right",
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const panelClass =
    side === "bottom"
      ? "fixed inset-x-0 bottom-0 z-[61] max-h-[90vh] rounded-t-xl border-t border-white/10"
      : "fixed top-0 right-0 bottom-0 z-[61] w-full max-w-lg border-l border-white/10 md:max-w-xl";

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close overlay"
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`${panelClass} flex flex-col bg-dark-950 shadow-2xl`}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Panel"}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
            <h2 className="text-sm font-mono text-neon-cyan uppercase tracking-widest">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-white/40 hover:text-white/80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>,
    document.body,
  );
}
