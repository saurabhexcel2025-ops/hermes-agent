// ═══════════════════════════════════════════════════════════════
// HardwareCronModal — Create / Edit hardware cron jobs
//
// Wraps Modal with a form for scheduling system crontab entries.
// Works in tandem with /api/cron/hardware (GET/POST/PUT/DELETE).
//
// Usage:
//   <HardwareCronModal
//     open={showModal}
//     onClose={() => setShowModal(false)}
//     onSave={async (job) => { ... }}
//     editingJob={null}          // create mode
//     editingJob={{ id, name, schedule, command, logFile, enabled }}  // edit mode
//   />
// ═══════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect } from "react";
import { Cpu, Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import CronScheduleInput from "@/components/cron/CronScheduleInput";
import { baseInputStyles } from "@/lib/theme";

export interface HardwareCronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  logFile?: string;
  enabled: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (job: Partial<HardwareCronJob>) => Promise<void>;
  editingJob?: HardwareCronJob | null;
}

// Available hardware cron script commands
const AVAILABLE_SCRIPTS = [
  { label: "Watchdog", value: "$HOME/.hermes/scripts/ch-watchdog.sh" },
  { label: "System Monitor", value: "$HOME/.hermes/scripts/ch-sysmon.sh" },
  { label: "Backup", value: "$HOME/.hermes/scripts/ch-backup.sh" },
  { label: "Health Check", value: "$HOME/.hermes/scripts/ch-health.sh" },
  { label: "Log Rotate", value: "$HOME/.hermes/scripts/ch-logrotate.sh" },
  { label: "Network Monitor", value: "$HOME/.hermes/scripts/ch-netmon.sh" },
];

export default function HardwareCronModal({ open, onClose, onSave, editingJob }: Props) {
  const isEdit = !!editingJob;

  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("*/5 * * * *");
  const [command, setCommand] = useState(AVAILABLE_SCRIPTS[0].value);
  const [logFile, setLogFile] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset / populate form when opening
  useEffect(() => {
    if (!open) return;
    setError(null);
    setScheduleError(null);

    if (editingJob) {
      setName(editingJob.name);
      setSchedule(editingJob.schedule);
      setCommand(editingJob.command);
      setLogFile(editingJob.logFile ?? "");
      setEnabled(editingJob.enabled);
    } else {
      setName("");
      setSchedule("*/5 * * * *");
      setCommand(AVAILABLE_SCRIPTS[0].value);
      setLogFile("");
      setEnabled(true);
    }
  }, [open, editingJob]);

  const handleSave = async () => {
    setError(null);

    // Validate schedule
    const fields = schedule.trim().split(/\s+/);
    if (fields.length !== 5) {
      setScheduleError("Schedule must have exactly 5 fields: min hour dom mon dow");
      return;
    }

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!command.trim()) {
      setError("Command (script) is required");
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        ...(editingJob ? { id: editingJob.id } : {}),
        name: name.trim(),
        schedule: schedule.trim(),
        command: command.trim(),
        logFile: logFile.trim() || undefined,
        enabled,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save hardware cron job");
    } finally {
      setIsSaving(false);
    }
  };

  const footer = (
    <>
      <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
        Cancel
      </Button>
      <Button
        variant="primary"
        size="sm"
        color="orange"
        onClick={handleSave}
        loading={isSaving}
      >
        {isEdit ? "Update Job" : "Create Job"}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Hardware Cron Job" : "New Hardware Cron Job"}
      icon={Cpu}
      iconColor="text-neon-orange"
      size="md"
      footer={footer}
    >
      <div className="space-y-5">

        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-white/70">
            Job Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nightly Backup"
            className={baseInputStyles}
          />
        </div>

        {/* Schedule */}
        <CronScheduleInput
          value={schedule}
          onChange={(val) => {
            setSchedule(val);
            setScheduleError(null);
          }}
          error={scheduleError}
        />

        {/* Command / Script */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-white/70">
            Script Command
          </label>
          <select
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className={`${baseInputStyles} cursor-pointer`}
          >
            {AVAILABLE_SCRIPTS.map((script) => (
              <option key={script.value} value={script.value}>
                {script.label} — {script.value}
              </option>
            ))}
          </select>
          <p className="text-xs text-white/30">
            System script to run. Logs are written to{" "}
            <span className="font-mono text-white/50">$HOME/.hermes/logs/</span>
          </p>
        </div>

        {/* Log File (optional, edit only) */}
        {isEdit && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-white/70">
              Log File
              <span className="ml-1.5 text-xs text-white/30 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={logFile}
              onChange={(e) => setLogFile(e.target.value)}
              placeholder="e.g. $HOME/.hermes/logs/custom.log"
              className={baseInputStyles}
            />
          </div>
        )}

        {/* Enabled toggle */}
        {isEdit && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                enabled ? "bg-neon-orange" : "bg-white/10"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-sm text-white/60">
              {enabled ? "Job is active" : "Job is paused"}
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
