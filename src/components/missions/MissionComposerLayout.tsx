"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export function ComposerFieldLabel({
  children,
  optional = false,
}: {
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <label className="text-xs text-white/40 font-mono block mb-1.5">
      {children}
      {optional && (
        <span className="text-white/25 font-normal"> (optional)</span>
      )}
    </label>
  );
}

export function ComposerSectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="pt-6 first:pt-0 border-t border-white/10 first:border-t-0">
      <h3 className="text-xs font-mono text-white/50 uppercase tracking-widest">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-white/30 font-mono mt-1 leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

export function ComposerAccordion({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="pt-6 border-t border-white/10 overflow-visible">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-3 py-3 text-left hover:bg-white/[0.02] rounded-lg -mx-1 px-1 transition-colors"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-xs font-mono text-white/50 uppercase tracking-widest">
            {title}
          </span>
          {description && (
            <span className="block text-xs text-white/30 font-mono mt-1 leading-relaxed">
              {description}
            </span>
          )}
        </span>
        <ChevronRight
          className={`w-4 h-4 text-white/40 shrink-0 mt-0.5 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="pb-2 pt-2 space-y-4 overflow-visible">
          {children}
        </div>
      )}
    </section>
  );
}
