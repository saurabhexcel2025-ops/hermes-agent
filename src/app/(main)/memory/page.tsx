// ═══════════════════════════════════════════════════════════════
// Memory Manager — Provider-aware memory browser
// ═══════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect } from "react";
import { Brain } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import AppPageShell from "@/components/layout/AppPageShell";
import HolographicBrowser from "@/components/memory/HolographicBrowser";
import type { MemoryProviderType } from "@/lib/memory-providers";
import type { MemoryReadResult } from "@/lib/memory-providers";

const PROVIDER_META: Record<string, { title: string; description: string }> = {
  hindsight: { title: "Hindsight Memory", description: "Knowledge graph memory with semantic search" },
  holographic: { title: "Holographic Memory", description: "Structured fact storage with trust scoring" },
};

export default function MemoryPage() {
  const [provider, setProvider] = useState<MemoryProviderType | null>(null);
  const [memData, setMemData] = useState<MemoryReadResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    fetch("/api/memory", { signal })
      .then((r) => r.json())
      .then((d) => {
        if (!signal.aborted) {
          setProvider(d.data?.provider || "none");
          setMemData(d.data || null);
        }
      })
      .catch(() => {
        if (!signal.aborted) {
          setProvider("none");
        }
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  const title = PROVIDER_META[provider ?? ""]?.title || "Memory";
  const description = provider
    ? (PROVIDER_META[provider]?.description || "No memory provider configured")
    : "Loading...";

  if (loading) {
    return (
      <AppPageShell>
        <PageHeader icon={Brain} title="Memory" subtitle="Loading..." color="pink" />
        <div className="px-6 py-12"><LoadingSpinner text="Detecting memory provider..." /></div>
      </AppPageShell>
    );
  }

  return (
    <AppPageShell>
      <PageHeader
        icon={Brain}
        title={title}
        subtitle={description}
        color="pink"
      />

      <div className="px-6 py-6">
        {provider === "holographic" && memData && <HolographicBrowser initialData={memData} />}
        {provider === "none" && (
          <div className="text-center py-12">
            <Brain className="w-12 h-12 text-pink-400/40 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">No Memory Provider</h2>
            <p className="text-sm text-white/50">Configure a memory provider to enable persistent memory.</p>
            <p className="text-xs text-white/30 font-mono mt-2">hermes memory setup</p>
          </div>
        )}
      </div>
    </AppPageShell>
  );
}