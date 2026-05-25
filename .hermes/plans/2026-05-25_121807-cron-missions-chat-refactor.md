# Cron, Missions, Chat — Codebase Refinement Plan

## Executive Summary

This plan addresses code quality issues in the Cron, Missions, and Chat subsystems of Control Hub. All changes preserve identical external behaviour. No API contract changes, no schema changes, no feature changes.

## Branch

`mission/hermes-review-and-refactor` (already created)

---

## 1. Cron: `recordToApiJob` missing `lastRun` field mapping

**Issue:** The API route (`api/cron/route.ts`) `recordToApiJob()` returns `last_run_at` (snake_case) but JobCard.tsx reads `lastRun` (camelCase) on line 189. The field always displays as undefined — no "Last run:" line ever appears.

The CronJob interface in JobCard.tsx defines both `lastRun` and `last_run_at` as optional, but only `lastRun` is consumed. The API only sends `last_run_at`.

**Fix:** Add `lastRun: job.last_run_at` to the `recordToApiJob` return so both field names are populated and the frontend renders correctly.

**Files:**
- `src/app/api/cron/route.ts` — add `lastRun` alias in `recordToApiJob`

---

## 2. Chat API Route: Eliminate duplicated fetch logic

**Issue:** Chat API route (`api/orchestration/chat/route.ts`) has two nearly-identical `fetch()` calls — one for streaming, one for non-streaming. The only difference is how the response is returned (new Response vs. NextResponse.json). The error handling, headers, body construction, and URL are identical.

**Fix:** Extract a shared `proxyToGateway()` helper that runs the fetch, checks response.ok, and returns the raw Response. Then streaming and non-streaming call it and wrap the result differently.

**Files:**
- `src/app/api/orchestration/chat/route.ts` — extract shared fetch helper

---

## 3. SystemCronModal: Extract `normalizePathSlashes` to shared lib

**Issue:** `normalizePathSlashes` is defined locally in `SystemCronModal.tsx` (line 30-32). It's a one-line utility (`p.replace(/\\/g, "/")`) that could be a shared utility.

**Fix:** Move to a shared location or keep inline but note it's potentially reusable. Given it's only used in one place and 3 lines, this is borderline — I'll extract it to a small shared location if it's used elsewhere, otherwise note it.

**Verdict:** Only used in this one component, 3 lines. Low value to extract. Skip.

---

## 4. `useCronJobs` `handleSync` unused by page

**Issue:** The `useCronJobs` hook exposes `handleSync()` (syncs agent jobs only) but the cron page's `handleSyncAll()` does both agent + hardware sync itself. The hook's `handleSync` is never called by the cron page.

**Fix:** Mark with a comment or remove if confirmed dead. The hook is still useful for standalone consumers, so keep but add a comment noting the page bypasses it.

**Files:**
- `src/hooks/useCronJobs.ts` — add clarifying comment about `handleSync`

---

## 5. Missions API: `resolveMissionId` helper name

**Issue:** The helper `resolveMissionId(body)` in `api/missions/route.ts` accepts `body.id ?? body.missionId` — the function name suggests resolution but it's just a field accessor. This is a style issue, not a bug.

**Fix:** Rename to `getMissionIdFromBody` for clarity.

**Files:**
- `src/app/api/missions/route.ts` — rename and update callers

---

## 6. SystemCronCard: `handleDelete` async gap

**Issue:** In `SystemCronCard.tsx` line 42-43, `handleDelete` calls `onDelete(job.id)` without `await` — but the parent's `handleDelete` in `useSystemCronJobs.ts` is async. While this works (the fire-and-forget doesn't block the confirm dialog), it's inconsistent with `JobCard.tsx` line 59 which does `await onDelete(job.id)`.

**Fix:** Add `void` prefix to make the fire-and-forget explicit, or `await` it. Given it's a UI action with a toast notification, `void` is appropriate to signal intentional fire-and-forget.

**Files:**
- `src/components/cron/SystemCronCard.tsx` — add `void` prefix to `onDelete`

---

## Summary of Changes

| # | File | Change | Risk |
|---|------|--------|------|
| 1 | `src/app/api/cron/route.ts` | Add `lastRun` alias in `recordToApiJob` | Low |
| 2 | `src/app/api/orchestration/chat/route.ts` | Extract shared fetch helper | Low |
| 3 | `src/hooks/useCronJobs.ts` | Add clarifying comment | None |
| 4 | `src/app/api/missions/route.ts` | Rename `resolveMissionId` → `getMissionIdFromBody` | Low |
| 5 | `src/components/cron/SystemCronCard.tsx` | Mark delete as fire-and-forget | None |

All 5 changes are **low risk** — they fix real field-mapping gaps, deduplicate code, clarify intent, or make async handling explicit. They do NOT change API shapes, database schemas, or external behaviour.

## Verification Plan

1. `npm run build` — zero compilation errors
2. `npm test` — all tests pass (especially `cron-api-record-fields.test.ts`, `api-routes-simple.test.ts`)
3. Manually verify: cron job cards show "last run" times correctly
