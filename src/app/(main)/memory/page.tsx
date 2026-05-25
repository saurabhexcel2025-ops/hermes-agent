// ═══════════════════════════════════════════════════════════════
// Memory Manager — Hindsight knowledge-graph memory browser
// ═══════════════════════════════════════════════════════════════
// Holographic provider was removed — the page now renders the
// full HindsightBrowser directly (no provider-branching needed).
// The page skeleton is minimal; HindsightBrowser handles its own
// loading state internally.
// ═══════════════════════════════════════════════════════════════

"use client";

import { Brain } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import AppPageShell from "@/components/layout/AppPageShell";
import HindsightBrowser from "@/components/memory/HindsightBrowser";

export default function MemoryPage() {
  return (
    <AppPageShell>
      <PageHeader
        icon={Brain}
        title="Hindsight Memory"
        subtitle="Knowledge graph memory with semantic search"
        color="pink"
      />
      <div className="px-6 py-6">
        <HindsightBrowser />
      </div>
    </AppPageShell>
  );
}