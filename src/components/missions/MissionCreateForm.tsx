"use client";

import { Send, Save } from "lucide-react";

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
import SkillSelector from "@/components/ui/SkillSelector";
import {
  ComposerAccordion,
  ComposerFieldLabel,
} from "@/components/missions/MissionComposerLayout";
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
  onManageCategories?: () => void;
  onSubmit: () => void;
  onSaveAsTemplate: () => void;
  onClose: () => void;
  dispatching: boolean;
}

const DISPATCH_MODES = [
  { id: "save" as const, label: "Save Draft" },
  { id: "now" as const, label: "Run Now" },
  { id: "queue" as const, label: "Queue" },
  { id: "cron" as const, label: "Recurring" },
];

export function MissionComposerActions({
  editingId,
  missions,
  formState,
  onSubmit,
  onSaveAsTemplate,
  onClose,
  dispatching,
}: Pick<
  MissionCreateFormProps,
  | "editingId"
  | "missions"
  | "formState"
  | "onSubmit"
  | "onSaveAsTemplate"
  | "onClose"
  | "dispatching"
>) {
  const existing = editingId
    ? missions.find((m) => m.id === editingId)
    : null;

  const isReDispatch =
    existing &&
    (existing.status === "successful" || existing.status === "failed");

  const isActiveEdit =
    existing &&
    (existing.status === "queued" || existing.status === "dispatched");

  const submitLabel = (() => {
    if (isReDispatch) return "Re-Dispatch Now";
    if (isActiveEdit) return "Update Mission";
    if (formState.newDispatch === "save") return "Save Mission";
    if (formState.newDispatch === "now") return "Dispatch Now";
    if (formState.newDispatch === "queue") return "Queue Mission";
    return "Schedule Mission";
  })();

  return (
    <div className="flex flex-wrap gap-2">
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
        {submitLabel}
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
  onManageCategories,
  onSubmit,
  onSaveAsTemplate,
  onClose,
  dispatching,
}: MissionCreateFormProps) {
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
    <div className="space-y-4">
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

      {categories.length === 0 && (
        <p className="text-xs font-mono text-neon-orange/80 bg-neon-orange/5 border border-neon-orange/20 rounded-lg px-3 py-2">
          No categories loaded — run database migrations or{" "}
          {onManageCategories ? (
            <button
              type="button"
              onClick={onManageCategories}
              className="text-neon-cyan underline"
            >
              manage categories
            </button>
          ) : (
            "open category manager"
          )}
          .
        </p>
      )}

      <CategoryCombobox
        categories={categories}
        value={categoryId}
        onChange={onCategoryChange}
        onCreateCategory={onCreateCategory}
        onManageCategories={onManageCategories}
      />

      <div>
        <ComposerFieldLabel>Mission Name</ComposerFieldLabel>
        <input
          value={formState.newName}
          onChange={(e) => setFormField("newName", e.target.value)}
          placeholder="e.g., Research quantum computing trends"
          className="w-full h-9 bg-dark-800/50 border border-white/10 rounded-lg px-3 text-sm text-white placeholder-white/20 outline-none focus:border-neon-cyan/50 font-mono"
        />
      </div>

      <div>
        <ComposerFieldLabel>Instruction Prompt</ComposerFieldLabel>
        <AutoTextarea
          value={formState.newInstruction}
          onChange={(v) => setFormField("newInstruction", v)}
          minRows={4}
          maxRows={16}
          placeholder="The agent's task instructions..."
        />
      </div>

      <div>
        <ComposerFieldLabel>Goals (one per line)</ComposerFieldLabel>
        <AutoTextarea
          value={formState.newGoals}
          onChange={(v) => setFormField("newGoals", v)}
          minRows={2}
          maxRows={8}
          placeholder="Gather data&#10;Analyze findings&#10;Write report"
        />
        <p className="text-[10px] text-white/25 font-mono mt-1.5">
          Optional checklist the agent should complete alongside the instruction.
        </p>
      </div>

      <ComposerAccordion
        title="Context & resources"
        description="Background, files, references, and skills"
        defaultOpen={false}
      >
        <div>
          <ComposerFieldLabel optional>Context Prompt</ComposerFieldLabel>
          <AutoTextarea
            value={formState.newContext}
            onChange={(v) => setFormField("newContext", v)}
            minRows={2}
            maxRows={8}
            placeholder="Additional context for this run..."
          />
        </div>

        <div>
          <ComposerFieldLabel optional>Local Directories</ComposerFieldLabel>
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
          <ComposerFieldLabel optional>Key References</ComposerFieldLabel>
          <div className="space-y-1.5">
            {formState.newReferences.map((ref, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-dark-800/50 border border-neon-pink/20 rounded-lg px-3 py-1.5 h-9"
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
            <div className="flex items-center gap-2">
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
                className="flex-1 h-9 bg-dark-800/50 border border-white/10 rounded-lg px-3 text-xs text-white placeholder-white/20 outline-none focus:border-neon-pink/50 font-mono"
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
                className="h-9 px-3 rounded-lg bg-neon-pink/10 border border-neon-pink/30 text-xs text-neon-pink font-mono shrink-0"
              >
                + Add
              </button>
            </div>
          </div>
        </div>

        <div>
          <ComposerFieldLabel optional>
            Attached Skills (max 10)
          </ComposerFieldLabel>
          <SkillSelector
            value={formState.newSkills}
            onChange={(skills) => setFormField("newSkills", skills)}
            profileId={formState.newProfile}
            max={10}
          />
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
      </ComposerAccordion>

      <ComposerAccordion
        title="Runtime"
        description="Profile, model, scope, and timeout"
        defaultOpen={false}
      >
        <AgentRuntimeDefaultsCard
          variant="embedded"
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
          timeoutHeading="Timeout"
        />
      </ComposerAccordion>

      <ComposerAccordion
        title="Dispatch"
        description="When and how this mission runs"
        defaultOpen={false}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DISPATCH_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setFormField("newDispatch", mode.id)}
              className={`h-9 px-3 rounded-lg text-xs font-mono border transition-colors ${
                formState.newDispatch === mode.id
                  ? "border-neon-cyan/50 bg-cyan-500/10 text-neon-cyan"
                  : "border-white/10 text-white/40 hover:text-white/60"
              }`}
            >
              {mode.label}
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
      </ComposerAccordion>

      {!embedded && (
        <MissionComposerActions
          editingId={editingId}
          missions={missions}
          formState={formState}
          onSubmit={onSubmit}
          onSaveAsTemplate={onSaveAsTemplate}
          onClose={onClose}
          dispatching={dispatching}
        />
      )}
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
