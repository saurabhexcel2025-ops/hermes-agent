// ═══════════════════════════════════════════════════════════════
// DetailSkeleton — Full-page skeleton for session detail
// Matches layout: header with stats + message thread
// Wraps in AppPageShell to match the session detail page.
// ═══════════════════════════════════════════════════════════════

import AppPageShell from "@/components/layout/AppPageShell";
import { shellHeaderBarClasses } from "@/lib/theme";

export function DetailSkeleton() {
  return (
    <AppPageShell>
      {/* Header — uses shellHeaderBarClasses to match actual page height (min-h-5rem = 80px) */}
      <div className={`${shellHeaderBarClasses} sticky top-0 z-30 justify-between gap-4 w-full animate-pulse`}>
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded bg-white/10" />
          <div className="space-y-1">
            <div className="h-5 w-64 rounded bg-white/10" />
            <div className="h-3 w-48 rounded bg-white/10" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-16 rounded bg-white/10" />
          <div className="h-6 w-16 rounded bg-white/10" />
          <div className="h-6 w-16 rounded bg-white/10" />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mt-3 px-6 py-3">
        <div className="h-3 w-20 rounded bg-white/10 animate-pulse" />
        <div className="h-3 w-3 rounded bg-white/10 animate-pulse" />
        <div className="h-3 w-32 rounded bg-white/10 animate-pulse" />
      </div>

      {/* Message thread */}
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`rounded-xl border border-white/10 bg-dark-900/30 overflow-hidden animate-pulse`}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-white/10" />
                <div className="h-3 w-16 rounded bg-white/10" />
              </div>
              <div className="h-3 w-8 rounded bg-white/10" />
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="h-3 w-full rounded bg-white/10" />
              <div className="h-3 w-3/4 rounded bg-white/10" />
              <div className="h-3 w-1/2 rounded bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </AppPageShell>
  );
}
