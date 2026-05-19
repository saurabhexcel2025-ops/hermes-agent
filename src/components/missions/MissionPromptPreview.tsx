"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ChevronDown, ChevronRight } from "lucide-react";
import { buildMissionPrompt } from "@/lib/build-mission-prompt";
import type { LocalDirEntry } from "@/types/hermes";

export interface MissionPromptPreviewProps {
  instruction: string;
  context: string;
  goals: string;
  localDirs: LocalDirEntry[];
  references: string[];
  skills: string[];
  missionTimeMinutes: number;
  timeoutMinutes: number;
}

export default function MissionPromptPreview(props: MissionPromptPreviewProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const preview = useMemo(() => {
    return buildMissionPrompt({
      instruction: props.instruction.trim(),
      context: props.context.trim() || undefined,
      goals: props.goals
        .split("\n")
        .map((g) => g.trim())
        .filter(Boolean),
      localDirs: props.localDirs,
      references: props.references,
      skills: props.skills,
      missionTimeMinutes: props.missionTimeMinutes,
      timeoutMinutes: props.timeoutMinutes,
    });
  }, [props]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-dark-950/50">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-xs font-mono text-white/40 uppercase tracking-widest hover:text-white/60"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          Assembled agent prompt
        </button>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex items-center gap-1 text-xs font-mono text-neon-cyan hover:text-neon-cyan/80"
        >
          <Copy className="w-3 h-3" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="px-3 pb-2 text-[10px] font-mono text-white/25 leading-relaxed">
        Profile personality (SOUL/AGENTS) comes from Hermes at ~/.hermes — this is
        the mission prompt sent to the agent.
      </p>
      {open && (
        <pre className="px-3 pb-3 text-[11px] font-mono text-white/60 whitespace-pre-wrap max-h-64 overflow-y-auto border-t border-white/5">
          {preview || "(empty)"}
        </pre>
      )}
    </div>
  );
}
