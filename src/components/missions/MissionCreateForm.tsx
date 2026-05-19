"use client";

import { useState } from "react";
import { ChevronRight, Send, Save } from "lucide-react";

import Button from "@/components/ui/Button";
import AutoTextarea from "@/components/ui/AutoTextarea";
import ScheduleSelector from "@/components/missions/ScheduleSelector";
import type { ScheduleMode } from "@/components/missions/ScheduleSelector";
import LocalDirRow from "@/components/missions/LocalDirRow";
import AgentRuntimeDefaultsCard from "@/components/missions/AgentRuntimeDefaultsCard";
import CategoryCombobox, {
  type CategoryOption,
} from "@/components/missions/CategoryCombobox";
import MissionPromptPreview from "@/components/missions/MissionPromptPreview";
import type { LocalDirEntry } from "@/types/hermes";

export interface MissionFormState {
  newName: string;
  newInstruction: string;
  newContext: string;
  newGoals: string;
  newDispatch: "save" | "now" | "cron" | "queue";
  newSchedule: string;
  scheduleType: ScheduleMode;
  scheduleStartTime: string;
  newMissionTime: number;
  newTimeout: number;
  newProfile: string;
  newModel: string;
  newProvider: string;
  newLocalDirs: LocalDirEntry[];
  localDirDraft: LocalDirEntry;
  newReferences: string[];
  referenceInput: string;
  newSkills: string[];
}

export interface MissionCreateFormProps {
  embedded?: boolean;
  editingId: string | null;
  missions: { id: string; name: string; status: string }[];
  formState: MissionFormState;
  setFormField: <K extends keyof MissionFormState>(
    field: K,
    value: MissionFormState[K],
  ) => void;
  categories: CategoryOption[];
  categoryId: string | null;
  onCategoryChange: (id: string | null) => void;
  onCreateCategory?: (name: string) => Promise<string | null>;
  onSubmit: () => void;
  onSaveAsTemplate: () => void;
  onClose: () => void;
  dispatching: boolean;
}

function FormSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-dark-900/30 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-mono text-white/40 uppercase tracking-widest hover:bg-white/[0.02]"
      >
        {title}
        <ChevronRight
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <div className="px-3 pb-3 space-y-3 border-t border-white/5">{children}</div>}
    </div>
  );
}

export default function MissionCreateForm({
  embedded = false,
  editingId,
  missions,
  formState,
  setFormField,
  categories,
  categoryId,
  onCategoryChange,
  onCreateCategory,
  onSubmit,
  onSaveAsTemplate,
  onClose,
  dispatching,
}: MissionCreateFormProps) {
  const [contextOpen, setContextOpen] = useState(false);
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(true);

  const existing = editingId
    ? missions.find((m) => m.id === editingId)
    : null;

  const isReDispatch =
    existing &&
    (existing.status === "successful" || existing.status === "failed");

  const isActiveEdit =
    existing &&
    (existing.status === "queued" || existing.status === "dispatched");

  const inner = (
    <div className="space-y-3">
      {editingId && isReDispatch && (
        <div className="rounded-lg bg-neon-cyan/5 border border-neon-cyan/20 p-3 text-xs text-neon-cyan/80 font-mono">
          A new mission will be created and dispatched immediately with your
          changes. The previous mission record will be kept for history.
        </div>
      )}
      {editingId && isActiveEdit && (
        <div className="rounded-lg bg-neon-orange/5 border border-neon-orange/20 p-3 text-xs text-neon-orange/80 font-mono">
          Updates apply to this mission and sync the linked cron job when
          schedule or prompt fields change.
        </div>
      )}

      <FormSection title="Overview" open={true} onToggle={() => {}}>
        <CategoryCombobox
          categories={categories}
          value={categoryId}
          onChange={onCategoryChange}
          onCreateCategory={onCreateCategory}
        />
        <div>
          <label className="text-xs text-white/40 font-mono block mb-1">
            Mission Name
          </label>
          <input
            value={formState.newName}
            onChange={(e) => setFormField("newName", e.target.value)}
            placeholder="e.g., Research quantum computing trends"
            className="w-full bg-dark-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-neon-cyan/50 font-mono"
          />
        </div>
      </FormSection>

      <FormSection title="Task" open={true} onToggle={() => {}}>
        <div>
          <label className="text-xs text-white/40 font-mono block mb-1">
            Goals (one per line)
          </label>
          <AutoTextarea
            value={formState.newGoals}
            onChange={(v) => setFormField("newGoals", v)}
            minRows={2}
            maxRows={8}
            placeholder="Gather data&#10;Analyze findings&#10;Write report"
          />
        </div>
        <div>
          <label className="text-xs text-white/40 font-mono block mb-1">
            Instruction Prompt
          </label>
          <AutoTextarea
            value={formState.newInstruction}
            onChange={(v) => setFormField("newInstruction", v)}
            minRows={4}
            maxRows={16}
            placeholder="The agent's task instructions..."
          />
        </div>
      </FormSection>

      <FormSection
        title="Context & resources"
        open={contextOpen}
        onToggle={() => setContextOpen(!contextOpen)}
      >
        <div>
          <label className="text-xs text-white/40 font-mono block mb-1">
            Context Prompt{" "}
            <span className="text-white/20">(optional)</span>
          </label>
          <AutoTextarea
            value={formState.newContext}
            onChange={(v) => setFormField("newContext", v)}
            minRows={2}
            maxRows={8}
            placeholder="Additional context for this run..."
          />
        </div>
        <div>
          <label className="text-xs text-white/40 font-mono block mb-1">
            Local Directories{" "}
            <span className="text-white/20">(optional)</span>
          </label>
          <div className="space-y-2">
            <LocalDirRow
              mode="draft"
              entry={formState.localDirDraft}
              onChange={(next) => setFormField("localDirDraft", next)}
              onAdd={() => {
                const p = formState.localDirDraft.path.trim();
                if (!p) return;
                if (formState.newLocalDirs.some((d) => d.path === p)) return;
                setFormField("newLocalDirs", [
                  ...formState.newLocalDirs,
                  {
                    path: p,
                    branch: formState.localDirDraft.branch || null,
                  },
                ]);
                setFormField("localDirDraft", { path: "", branch: null });
              }}
            />
            {formState.newLocalDirs.map((dir, i) => (
              <div
                key={`${dir.path}-${i}`}
                className="rounded-lg border border-neon-cyan/15 bg-dark-800/30 px-2 py-2"
              >
                <LocalDirRow
                  mode="saved"
                  entry={dir}
                  onChange={(next) =>
                    setFormField(
                      "newLocalDirs",
                      formState.newLocalDirs.map((x, j) =>
                        j === i ? next : x,
                      ),
                    )
                  }
                  onDelete={() =>
                    setFormField(
                      "newLocalDirs",
                      formState.newLocalDirs.filter((_, j) => j !== i),
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-white/40 font-mono block mb-1">
            Key References{" "}
            <span className="text-white/20">(optional)</span>
          </label>
          <div className="space-y-1.5">
            {formState.newReferences.map((ref, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-dark-800/50 border border-neon-pink/20 rounded-lg px-3 py-1.5"
              >
                <span className="text-xs font-mono text-neon-pink truncate flex-1">
                  {ref}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setFormField(
                      "newReferences",
                      formState.newReferences.filter((_, j) => j !== i),
                    )
                  }
                  className="text-white/30 hover:text-red-400 text-xs"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={formState.referenceInput}
                onChange={(e) =>
                  setFormField("referenceInput", e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && formState.referenceInput.trim()) {
                    e.preventDefault();
                    setFormField("newReferences", [
                      ...formState.newReferences,
                      formState.referenceInput.trim(),
                    ]);
                    setFormField("referenceInput", "");
                  }
                }}
                placeholder="URL, doc path..."
                className="flex-1 bg-dark-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 outline-none focus:border-neon-pink/50 font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  if (formState.referenceInput.trim()) {
                    setFormField("newReferences", [
                      ...formState.newReferences,
                      formState.referenceInput.trim(),
                    ]);
                    setFormField("referenceInput", "");
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-neon-pink/10 border border-neon-pink/30 text-xs text-neon-pink font-mono"
              >
                + Add
              </button>
            </div>
          </div>
        </div>
        <MissionPromptPreview
          instruction={formState.newInstruction}
          context={formState.newContext}
          goals={formState.newGoals}
          localDirs={formState.newLocalDirs}
          references={formState.newReferences}
          skills={formState.newSkills}
          missionTimeMinutes={formState.newMissionTime}
          timeoutMinutes={formState.newTimeout}
        />
      </FormSection>

      <FormSection
        title="Runtime"
        open={runtimeOpen}
        onToggle={() => setRuntimeOpen(!runtimeOpen)}
      >
        <AgentRuntimeDefaultsCard
          profileId={formState.newProfile}
          onProfileChange={(id) => setFormField("newProfile", id)}
          missionTimeMinutes={formState.newMissionTime}
          onMissionTimeChange={(v) => setFormField("newMissionTime", v)}
          timeoutMinutes={formState.newTimeout}
          onTimeoutChange={(v) => setFormField("newTimeout", v)}
          modelId={formState.newModel}
          provider={formState.newProvider}
          onModelChange={(mid, prov) => {
            setFormField("newModel", mid);
            setFormField("newProvider", prov);
          }}
          timeoutHeading="Timeout (Advanced)"
          skills={formState.newSkills}
          onSkillsChange={(skills) => setFormField("newSkills", skills)}
        />
        <p className="text-[10px] text-white/25 font-mono">
          Profile defines agent role via SOUL/AGENTS under your Hermes home.
        </p>
      </FormSection>

      <FormSection
        title="Dispatch"
        open={dispatchOpen}
        onToggle={() => setDispatchOpen(!dispatchOpen)}
      >
        <div className="flex flex-wrap items-center gap-2">
          {(["save", "now", "queue", "cron"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFormField("newDispatch", mode)}
              className={`px-3 py-1 rounded-lg text-xs font-mono border transition-colors ${
                formState.newDispatch === mode
                  ? "border-neon-cyan/50 bg-cyan-500/10 text-neon-cyan"
                  : "border-white/10 text-white/40 hover:text-white/60"
              }`}
            >
              {mode === "save"
                ? "Save Draft"
                : mode === "now"
                  ? "Run Now"
                  : mode === "queue"
                    ? "Queue"
                    : "Recurring"}
            </button>
          ))}
        </div>
        {formState.newDispatch === "cron" && (
          <ScheduleSelector
            value={formState.newSchedule}
            onChange={(s) => setFormField("newSchedule", s)}
            mode={formState.scheduleType}
            onModeChange={(m) => setFormField("scheduleType", m)}
            startTime={formState.scheduleStartTime}
            onStartTimeChange={(t) => setFormField("scheduleStartTime", t)}
          />
        )}
      </FormSection>

      <div className="flex flex-wrap gap-2 pt-2 sticky bottom-0 bg-dark-950/95 backdrop-blur py-3 border-t border-white/10 -mx-1 px-1">
        <Button
          onClick={onSubmit}
          disabled={
            !formState.newName.trim() ||
            !formState.newInstruction.trim() ||
            dispatching
          }
          loading={dispatching}
        >
          <Send className="w-3.5 h-3.5" />
          {(() => {
            if (isReDispatch) return "Re-Dispatch Now";
            if (isActiveEdit) return "Update Mission";
            if (formState.newDispatch === "save") return "Save Mission";
            if (formState.newDispatch === "now") return "Dispatch Now";
            if (formState.newDispatch === "queue") return "Queue Mission";
            return "Schedule Mission";
          })()}
        </Button>
        {formState.newInstruction.trim() && (
          <Button variant="secondary" onClick={onSaveAsTemplate}>
            <Save className="w-3.5 h-3.5" /> Save as Template
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );

  if (embedded) {
    return inner;
  }

  return (
    <div className="rounded-xl border border-neon-cyan/20 bg-dark-900/50 p-4 mb-6">
      <h3 className="text-sm font-mono text-neon-cyan uppercase tracking-widest mb-4">
        {editingId ? "Edit Mission" : "New Mission"}
      </h3>
      {inner}
    </div>
  );
}
