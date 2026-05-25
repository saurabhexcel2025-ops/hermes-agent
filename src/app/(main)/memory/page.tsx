// ═══════════════════════════════════════════════════════════════
// Memory Manager — Hindsight knowledge-graph memory browser
// ═══════════════════════════════════════════════════════════════
// Holographic provider was removed — the page now renders the
// full HindsightBrowser directly (no provider-branching needed).
// ═══════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect } from "react";
import { Brain } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import AppPageShell from "@/components/layout/AppPageShell";
import HindsightBrowser from "@/components/memory/HindsightBrowser";

export default function MemoryPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // HindsightBrowser fetches its own health on mount;
    // the page only needs to suppress the skeleton until ready.
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <AppPageShell>
        <PageHeader icon={Brain} title="Memory" subtitle="Loading..." color="pink" />
        <div className="px-6 py-12"><LoadingSpinner text="Loading memory..." /></div>
      </AppPageShell>
    );
  }

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