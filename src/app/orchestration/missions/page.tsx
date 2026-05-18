"use client";

import { Loader2, Plus, RefreshCw, Rocket } from "lucide-react";
import AppPageShell from "@/components/layout/AppPageShell";
import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import {
  TemplateEditorModal,
  TemplateManagerModal,
} from "@/components/missions/TemplateModals";
import { useMissionsPage } from "./hooks/useMissionsPage";
import MissionsList from "./components/MissionsList";

export default function MissionsPage() {
  const vm = useMissionsPage();
  const {
    loading,
    toastElement,
    fetchData,
    setShowCreate,
    templates,
    showTemplateManager,
    setShowTemplateManager,
    handleEditTemplate,
    handleDeleteTemplate,
    categoryFilter,
    showTemplateEditor,
    setShowTemplateEditor,
    editingTemplateId,
    setEditingTemplateId,
    templateName,
    setTemplateName,
    templateDescription,
    setTemplateDescription,
    templateIcon,
    setTemplateIcon,
    templateColor,
    setTemplateColor,
    templateSaving,
    handleTemplateSave,
    newInstruction,
    setNewInstruction,
    newContext,
    setNewContext,
    newGoals,
    setNewGoals,
    newProfile,
    setNewProfile,
    newModel,
    newProvider,
    setNewModel,
    setNewProvider,
    newMissionTime,
    setNewMissionTime,
    newTimeout,
    setNewTimeout,
    newLocalDirs,
    setNewLocalDirs,
    localDirDraft,
    setLocalDirDraft,
    newReferences,
    setNewReferences,
    referenceInput,
    setReferenceInput,
    newSkills,
    setNewSkills,
  } = vm;

  if (loading) {
    return (
      <AppPageShell variant="scanlines">
        <div className="flex flex-1 min-h-[50vh] items-center justify-center">
          <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
        </div>
      </AppPageShell>
    );
  }

  return (
    <AppPageShell variant="scanlines">
      {toastElement}

      <PageHeader
        icon={Rocket}
        title="Missions"
        subtitle="Dispatch and track agent missions"
        color="cyan"
        actions={
          <>
            <button
              type="button"
              onClick={fetchData}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
              aria-label="Refresh missions"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Button onClick={() => setShowCreate(true)} size="sm">
              <Plus className="w-3.5 h-3.5" /> New Mission
            </Button>
          </>
        }
      />

      <MissionsList vm={vm} />

      <TemplateManagerModal
        open={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
        templates={templates}
        categoryFilter={categoryFilter}
        onEditTemplate={handleEditTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />

      <TemplateEditorModal
        open={showTemplateEditor}
        onClose={() => setShowTemplateEditor(false)}
        onCancel={() => {
          setShowTemplateEditor(false);
          setEditingTemplateId(null);
        }}
        editingTemplateId={editingTemplateId}
        templateName={templateName}
        onTemplateNameChange={setTemplateName}
        templateDescription={templateDescription}
        onTemplateDescriptionChange={setTemplateDescription}
        templateIcon={templateIcon}
        onTemplateIconChange={setTemplateIcon}
        templateColor={templateColor}
        onTemplateColorChange={setTemplateColor}
        templateSaving={templateSaving}
        onSave={handleTemplateSave}
        newInstruction={newInstruction}
        onNewInstructionChange={setNewInstruction}
        newContext={newContext}
        onNewContextChange={setNewContext}
        newGoals={newGoals}
        onNewGoalsChange={setNewGoals}
        newProfile={newProfile}
        onNewProfileChange={setNewProfile}
        newModel={newModel}
        newProvider={newProvider}
        onModelChange={(mid, prov) => {
          setNewModel(mid);
          setNewProvider(prov);
        }}
        newMissionTime={newMissionTime}
        onNewMissionTimeChange={setNewMissionTime}
        newTimeout={newTimeout}
        onNewTimeoutChange={setNewTimeout}
        newLocalDirs={newLocalDirs}
        onNewLocalDirsChange={setNewLocalDirs}
        localDirDraft={localDirDraft}
        onLocalDirDraftChange={setLocalDirDraft}
        newReferences={newReferences}
        onNewReferencesChange={setNewReferences}
        referenceInput={referenceInput}
        onReferenceInputChange={setReferenceInput}
        newSkills={newSkills}
        onNewSkillsChange={setNewSkills}
      />
    </AppPageShell>
  );
}
