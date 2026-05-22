// ═══════════════════════════════════════════════════════════════
// /api/missions — Mission CRUD + dispatch (SQLite)
// ═══════════════════════════════════════════════════════════════
// Missions are stored in Control Hub SQLite. Dispatch is handled
// by the Hermes backend for mission execution.
import { NextRequest, NextResponse } from "next/server";
import {
  getMission,
  listMissions,
  createMission,
  updateMission,
  deleteMission,
  buildMissionPrompt,
} from "@/lib/mission-repository";
import { parseMissionPrompt } from "@/lib/build-mission-prompt";
import { createSession, updateSession } from "@/lib/session-repository";
import { normalizeLocalDirsInput } from "@/lib/local-dir-entry";
import type { LocalDirEntry } from "@/types/hermes";
import { requireAuth } from "@/lib/api-auth";
import { logApiError } from "@/lib/api-logger";
import { appendAuditLine } from "@/lib/audit-log";
import type { MissionStatus } from "@/lib/agent-backend/types";
import { agentBackend } from "@/lib/backends";
import { createCronJob, deleteCronJob, pushJobToHermes } from "@/lib/cron-repository";
import { getCategory } from "@/lib/mission-category-repository";
import { listProfiles } from "@/lib/profiles-repository";
import {
  deleteMissionCron,
  enrichMissionCron,
  pauseMissionCron,
  syncMissionToCronJob,
} from "@/lib/mission-cron-sync";

// ── Helpers ───────────────────────────────────────────────────────

function resolveMissionId(body: Record<string, unknown>): string | undefined {
  return (body.id ?? body.missionId) as string | undefined;
}

function parseCategoryId(
  raw: unknown,
): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") {
    return { ok: false, error: "categoryId must be a string" };
  }
  if (!getCategory(raw)) {
    return { ok: false, error: "Category not found" };
  }
  return { ok: true, value: raw };
}

// ── GET ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  try {
    if (id) {
      const mission = getMission(id);
      if (!mission) {
        return NextResponse.json({ error: "Mission not found" }, { status: 404 });
      }
      // Mission status is synced in background by MissionSync
      return NextResponse.json({ data: { mission: enrichMissionCron(mission) } });
    }

    const categoryIdParam = url.searchParams.get("categoryId");
    const missions = listMissions(
      categoryIdParam === "__uncategorized__"
        ? { categoryId: null }
        : categoryIdParam
          ? { categoryId: categoryIdParam }
          : undefined,
    ).map((m) => enrichMissionCron(m));
    return NextResponse.json({ data: { missions } });
  } catch (error) {
    logApiError("GET /api/missions", id ? `mission ${id}` : "listing missions", error);
    return NextResponse.json({ error: "Failed to load missions" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const body = await request.json();
    const { action } = body as { action?: string };

    // ── Dispatch Mission ────────────────────────────────────────
    if (action === "dispatch") {
      const {
        name,
        instruction,
        profileId,
        profileName,
        modelId,
        provider,
        localDirs,
        references,
        skills,
        suggestedToolsets,
        goals,
        context,
        dispatchMode,
        schedule: scheduleVal,
        missionTimeMinutes,
        timeoutMinutes,
        categoryId: categoryIdRaw,
        outputFormat,
        constraints,
      } = body as {
        name?: string;
        instruction?: string;
        profileId?: string;
        profileName?: string;
        modelId?: string;
        provider?: string;
        localDirs?: unknown;
        references?: string[];
        skills?: string[];
        suggestedToolsets?: string[];
        goals?: string[];
        context?: string;
        dispatchMode?: string;
        schedule?: string;
        missionTimeMinutes?: number;
        timeoutMinutes?: number;
        categoryId?: string | null;
        outputFormat?: string;
        constraints?: string;
      };

      const categoryParsed = parseCategoryId(categoryIdRaw);
      if (!categoryParsed.ok) {
        return NextResponse.json({ error: categoryParsed.error }, { status: 400 });
      }

      if (!instruction || typeof instruction !== "string" || !instruction.trim()) {
        return NextResponse.json({ error: "instruction is required" }, { status: 400 });
      }

      const dirsNorm = normalizeLocalDirsInput(localDirs);

      const prompt = buildMissionPrompt({
        instruction: instruction.trim(),
        localDirs: dirsNorm,
        references: references ?? [],
        skills: skills ?? [],
        toolsets: suggestedToolsets ?? [],
        goals: goals ?? [],
        context: context ?? "",
        missionTimeMinutes: missionTimeMinutes ?? undefined,
        timeoutMinutes: timeoutMinutes ?? undefined,
        outputFormat: outputFormat ?? "",
        constraints: constraints ?? "",
      });

      // Resolve profile slug from Control Hub registry (matches Hermes --profile <slug>).
      let resolvedProfileId: string | undefined;
      const profileKey = profileName ?? profileId;
      if (profileKey) {
        if (profileKey === "default") {
          resolvedProfileId = "default";
        } else {
          try {
            const profiles = listProfiles();
            const match = profiles.find(
              (p) =>
                p.slug === profileKey ||
                p.displayName === profileKey,
            );
            resolvedProfileId = match?.slug ?? profileKey;
          } catch {
            resolvedProfileId = profileKey;
          }
        }
      }

      const mission = createMission({
        name: (name as string)?.trim() || "Untitled Mission",
        prompt,
        profileId: resolvedProfileId ?? profileId,
        localDirs: dirsNorm,
        references: references ?? [],
        skills: skills ?? [],
        suggestedToolsets: suggestedToolsets ?? [],
        goals: goals ?? [],
        modelId: modelId ?? undefined,
        provider: provider ?? undefined,
        profileName: profileName ?? undefined,
        missionTimeMinutes,
        timeoutMinutes,
        schedule: scheduleVal,
        categoryId: categoryParsed.value ?? null,
        outputFormat: outputFormat?.trim() || undefined,
        constraints: constraints?.trim() || undefined,
      });

      const isSaveMode = dispatchMode === "save" || dispatchMode === "queue";
      const isCronMode = dispatchMode === "cron" && scheduleVal;

      if (isCronMode) {
        // ── Recurring mission: create a cron job + dispatch first run immediately ──
        // Creating a cron job handles subsequent runs on schedule, but the user
        // expects the first run to start right away rather than waiting for the
        // next schedule tick.

        try {
          const profileNameFinal = profileName as string | undefined;
          const cronJob = createCronJob({
            name: mission.name,
            prompt: mission.prompt,
            skills: skills as string[] | undefined,
            model: modelId as string | undefined,
            provider: provider as string | undefined,
            schedule: scheduleVal!,
            repeat: { times: null }, // infinite
            enabled: true,
            state: "scheduled",
            deliver: "none",
            profile_name: profileNameFinal ?? "default",
            source: "ch",
          });

          // Link mission to cron job
          updateMission(mission.id, { cronJobId: cronJob.id });

          // Push to Hermes so the scheduler picks it up
          const pushResult = pushJobToHermes(cronJob.id);
          if (!pushResult.ok) {
            logApiError("POST /api/missions", "pushJobToHermes", pushResult.error);
            deleteCronJob(cronJob.id);
            updateMission(mission.id, { cronJobId: null, status: "failed" });
            appendAuditLine({ action: "mission.cron_dispatch", resource: mission.id, ok: false });
            return NextResponse.json(
              {
                error: "Failed to sync cron job to Hermes",
                cronPushError: pushResult.error ?? "unknown",
                data: { mission: enrichMissionCron(getMission(mission.id)!) },
              },
              { status: 502 }
            );
          }

          // ── Immediate first-run dispatch ──
          // Don't wait for the cron scheduler — start the first run now.
          updateMission(mission.id, { status: "dispatched" });

          let sessionIdFromDb: string | undefined;
          try {
            const session = createSession({
              source: "mission",
              missionId: mission.id,
              profileName: profileName ?? null,
              modelId: modelId ?? null,
              provider: provider ?? null,
              title: mission.name,
              status: "active",
            });
            sessionIdFromDb = session.id;
          } catch (err) {
            logApiError("POST /api/missions", "createSession (cron)", err);
          }

          try {
            const dispatched = await agentBackend.dispatchMission({
              missionId: mission.id,
              name: mission.name,
              prompt: mission.prompt,
              profileId: mission.profileId,
              profileName,
              modelId,
              provider,
            });

            let sessionId: string | undefined = dispatched.sessionId ?? sessionIdFromDb;
            if (!sessionId && sessionIdFromDb) {
              sessionId = sessionIdFromDb;
            } else if (!sessionId) {
              for (let attempt = 0; attempt < 10; attempt++) {
                await new Promise((r) => setTimeout(r, 800));
                try {
                  const sid = await agentBackend.getMissionSessionId?.(mission.id);
                  if (sid) {
                    sessionId = sid;
                    break;
                  }
                } catch { /* keep polling */ }
              }
            }

            updateMission(mission.id, {
              sessionId,
              status: "dispatched",
            });
          } catch (err) {
            logApiError("POST /api/missions", "immediate dispatch (cron)", err);
            if (sessionIdFromDb) {
              updateSession(sessionIdFromDb, { status: "failed", endedAt: new Date().toISOString() });
            }
            updateMission(mission.id, { status: "failed" });
          }

          appendAuditLine({ action: "mission.cron_dispatch", resource: mission.id, ok: true });
          return NextResponse.json(
            { data: { mission: enrichMissionCron(getMission(mission.id)!) } },
            { status: 201 }
          );
        } catch (err) {
          logApiError("POST /api/missions", "cron dispatch", err);
          updateMission(mission.id, { status: "failed" });
          appendAuditLine({ action: "mission.cron_dispatch", resource: mission.id, ok: false });
          return NextResponse.json({ error: "Failed to create cron job for mission" }, { status: 500 });
        }
      }

      if (!isSaveMode) {
        updateMission(mission.id, { status: "dispatched" });

        // Pre-register the session in Control Hub's unified registry.
        // This links the mission to its session before hermes even starts,
        // so the Sessions page shows it immediately after dispatch.
        let sessionIdFromDb: string | undefined;
        try {
          const session = createSession({
            source: "mission",
            missionId: mission.id,
            profileName: profileName ?? null,
            modelId: modelId ?? null,
            provider: provider ?? null,
            title: mission.name,
            status: "active",
          });
          sessionIdFromDb = session.id;
        } catch (err) {
          logApiError("POST /api/missions", "createSession", err);
        }

        try {
          // Pass mission.id so dispatchMission writes all output files
          // (.session, .status.json, .output.log) under the same ID the
          // API returned to the caller. Without this, the backend generates
          // its own UUID and files are never matched to the DB record.
          const dispatched = await agentBackend.dispatchMission({
            missionId: mission.id,
            name: mission.name,
            prompt: mission.prompt,
            profileId: mission.profileId,
            profileName,
            modelId,
            provider,
          });

          // Capture session ID from the running hermes process.
          // Prefer the hermes-reported session ID; fall back to our pre-registered one.
          let sessionId: string | undefined = dispatched.sessionId ?? sessionIdFromDb;
          if (!sessionId && sessionIdFromDb) {
            sessionId = sessionIdFromDb;
          } else if (!sessionId) {
            for (let attempt = 0; attempt < 10; attempt++) {
              await new Promise((r) => setTimeout(r, 800));
              try {
                const sid = await agentBackend.getMissionSessionId?.(mission.id);
                if (sid) {
                  sessionId = sid;
                  break;
                }
              } catch { /* keep polling */ }
            }
          }

          updateMission(mission.id, {
            sessionId,
            status: "dispatched",
          });
        } catch (err) {
          logApiError("POST /api/missions", "dispatch", err);
          // Mark the session as failed
          if (sessionIdFromDb) {
            updateSession(sessionIdFromDb, { status: "failed", endedAt: new Date().toISOString() });
          }
          updateMission(mission.id, { status: "failed" });
        }
      }

      appendAuditLine({ action: "mission.dispatch", resource: mission.id, ok: true });
      return NextResponse.json(
        { data: { mission: enrichMissionCron(getMission(mission.id)!) } },
        { status: 201 }
      );
    }

    // ── Update Mission ─────────────────────────────────────────
    if (action === "update") {
      const { status, result, instruction, localDirs, references, skills, suggestedToolsets, goals, modelId, provider, profileName, missionTimeMinutes, timeoutMinutes, schedule, context, categoryId: categoryIdRaw, outputFormat, constraints } = body as {
        id?: string;
        missionId?: string;
        status?: string;
        result?: string;
        instruction?: string;
        localDirs?: unknown;
        references?: string[];
        skills?: string[];
        suggestedToolsets?: string[];
        goals?: string[];
        modelId?: string;
        provider?: string;
        profileName?: string;
        missionTimeMinutes?: number;
        timeoutMinutes?: number;
        schedule?: string;
        context?: string;
        categoryId?: string | null;
        outputFormat?: string;
        constraints?: string;
      };
      const missionIdFinal = resolveMissionId(body as Record<string, unknown>);
      if (!missionIdFinal)
        return NextResponse.json({ error: "Mission id is required" }, { status: 400 });

      const existing = getMission(missionIdFinal);
      if (!existing) {
        return NextResponse.json({ error: "Mission not found" }, { status: 404 });
      }

      const categoryParsed = parseCategoryId(categoryIdRaw);
      if (!categoryParsed.ok) {
        return NextResponse.json({ error: categoryParsed.error }, { status: 400 });
      }

      let prompt: string | undefined;
      const shouldRebuildPrompt =
        instruction !== undefined ||
        context !== undefined ||
        localDirs !== undefined ||
        references !== undefined ||
        skills !== undefined ||
        suggestedToolsets !== undefined ||
        goals !== undefined ||
        missionTimeMinutes !== undefined ||
        timeoutMinutes !== undefined ||
        outputFormat !== undefined ||
        constraints !== undefined;

      if (shouldRebuildPrompt) {
        const parsed = parseMissionPrompt(existing.prompt);
        prompt = buildMissionPrompt({
          instruction:
            instruction !== undefined ? instruction.trim() : parsed.instruction,
          context: context !== undefined ? context : parsed.context,
          localDirs:
            localDirs !== undefined
              ? normalizeLocalDirsInput(localDirs)
              : existing.localDirs,
          references: references !== undefined ? references : existing.references,
          skills: skills !== undefined ? skills : existing.skills,
          toolsets:
            suggestedToolsets !== undefined
              ? suggestedToolsets
              : existing.suggestedToolsets,
          goals: goals !== undefined ? goals : existing.goals,
          missionTimeMinutes:
            missionTimeMinutes !== undefined
              ? missionTimeMinutes
              : existing.missionTimeMinutes,
          timeoutMinutes:
            timeoutMinutes !== undefined
              ? timeoutMinutes
              : existing.timeoutMinutes,
          outputFormat:
            outputFormat !== undefined
              ? outputFormat
              : existing.outputFormat ?? parsed.outputFormat,
          constraints:
            constraints !== undefined
              ? constraints
              : existing.constraints ?? parsed.constraints,
        });
      }

      const updates: {
        status?: MissionStatus;
        result?: string;
        prompt?: string;
        localDirs?: LocalDirEntry[];
        references?: string[];
        skills?: string[];
        suggestedToolsets?: string[];
        goals?: string[];
        modelId?: string | null;
        provider?: string | null;
        profileName?: string | null;
        missionTimeMinutes?: number | null;
        timeoutMinutes?: number | null;
        schedule?: string | null;
        categoryId?: string | null;
        outputFormat?: string | null;
        constraints?: string | null;
      } = {};
      if (status) updates.status = status as MissionStatus;
      if (result !== undefined) updates.result = result;
      if (prompt !== undefined) updates.prompt = prompt;
      if (outputFormat !== undefined) {
        updates.outputFormat = outputFormat.trim() || null;
      }
      if (constraints !== undefined) {
        updates.constraints = constraints.trim() || null;
      }
      if (localDirs !== undefined) updates.localDirs = normalizeLocalDirsInput(localDirs);
      if (references !== undefined) updates.references = references;
      if (skills !== undefined) updates.skills = skills;
      if (suggestedToolsets !== undefined) updates.suggestedToolsets = suggestedToolsets;
      if (goals !== undefined) updates.goals = goals;
      if (modelId !== undefined) updates.modelId = modelId;
      if (provider !== undefined) updates.provider = provider;
      if (profileName !== undefined) updates.profileName = profileName;
      if (missionTimeMinutes !== undefined) updates.missionTimeMinutes = missionTimeMinutes;
      if (timeoutMinutes !== undefined) updates.timeoutMinutes = timeoutMinutes;
      if (schedule !== undefined) updates.schedule = schedule;
      if (categoryParsed.value !== undefined) updates.categoryId = categoryParsed.value;

      const mission = updateMission(missionIdFinal, updates);
      if (!mission)
        return NextResponse.json({ error: "Mission not found" }, { status: 404 });

      if (mission.cronJobId && shouldRebuildPrompt) {
        syncMissionToCronJob(missionIdFinal);
      } else if (mission.cronJobId && schedule !== undefined) {
        syncMissionToCronJob(missionIdFinal);
      }

      if (prompt !== undefined) {
        try {
          await agentBackend.syncMission(missionIdFinal, { prompt: mission.prompt });
        } catch (err) {
          logApiError("POST /api/missions", "syncMission disk", err);
        }
      }

      appendAuditLine({ action: "mission.update", resource: missionIdFinal, ok: true });
      return NextResponse.json({
        data: { mission: enrichMissionCron(getMission(missionIdFinal)!) },
      });
    }

    // ── Cancel Mission ─────────────────────────────────────────
    // The unified V1 status enum has no `cancelled` state — cancellations
    // are recorded as `failed` with an explicit "Cancelled by user" result.
    if (action === "cancel") {
      const cancelId = resolveMissionId(body as Record<string, unknown>);
      if (!cancelId)
        return NextResponse.json({ error: "Mission id is required" }, { status: 400 });

      const existingMission = getMission(cancelId);
      if (!existingMission)
        return NextResponse.json({ error: "Mission not found" }, { status: 404 });

      const mission = updateMission(cancelId, {
        status: "failed",
        result: "Cancelled by user",
      });
      if (!mission)
        return NextResponse.json({ error: "Mission not found" }, { status: 404 });

      if (mission.sessionId) {
        try {
          updateSession(mission.sessionId, {
            status: "failed",
            endedAt: new Date().toISOString(),
            error: "Cancelled by user",
          });
        } catch (err) {
          logApiError("POST /api/missions", "cancelMission session update", err);
        }
      }

      pauseMissionCron(cancelId);

      const shouldKillProcess =
        existingMission.status === "dispatched" || existingMission.status === "queued";
      if (shouldKillProcess) {
        void agentBackend.cancelMission(cancelId).catch((err: unknown) => {
          logApiError("POST /api/missions", "cancelMission process kill (background)", err);
        });
      }

      appendAuditLine({ action: "mission.cancel", resource: cancelId, ok: true });
      return NextResponse.json({
        data: {
          mission: enrichMissionCron(mission),
          cancel: {
            accepted: true,
            processKillPending: shouldKillProcess,
          },
        },
      });
    }

    // ── Delete Mission ─────────────────────────────────────────
    if (action === "delete") {
      const missionIdFinal = resolveMissionId(body as Record<string, unknown>);
      if (!missionIdFinal)
        return NextResponse.json({ error: "Mission id is required" }, { status: 400 });

      const existing = getMission(missionIdFinal);
      if (!existing) {
        return NextResponse.json({ error: "Mission not found" }, { status: 404 });
      }

      deleteMissionCron(missionIdFinal);

      const ok = deleteMission(missionIdFinal);
      if (!ok)
        return NextResponse.json({ error: "Mission not found" }, { status: 404 });

      appendAuditLine({ action: "mission.delete", resource: missionIdFinal, ok: true });
      return NextResponse.json({ data: { deleted: missionIdFinal } });
    }

    // ── Get Status ────────────────────────────────────────────
    if (action === "status") {
      const { id } = body as { id?: string };
      if (!id)
        return NextResponse.json({ error: "Mission id is required" }, { status: 400 });

      const status = await agentBackend.getMissionStatus(id);
      return NextResponse.json({ data: { status } });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    logApiError("POST /api/missions", "processing request", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
