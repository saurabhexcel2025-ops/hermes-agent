# Control Hub Full User Flow Assessment — 2026-05-18

## Executive Summary

Comprehensive E2E testing conducted across all three Orchestration pages (Kanban, Goals, Chat). **3 critical bugs found and fixed**, 2 major missing features identified, and 3 significant design/UX improvement recommendations. The core architecture is solid — streaming Chat, Kanban Drawer, Goals with checkpoint/linking — but several integration gaps and routing issues were discovered.

---

## 1. KANBAN PAGE — Assessment

### ✅ Working Features
- Task creation via modal + inline column buttons
- 7-column board display (triage → archived)
- Board switcher (Default board)
- Search, status/assignee/tenant filters, archived toggle
- "Specify all triage" and "Nudge dispatcher" buttons
- Card click opens detail drawer
- 10-second auto-polling
- Card selection with checkboxes (fully wired per-column with select-all)
- BatchActionToolbar appears when cards selected

### 🐛 Found & Fixed: Drawer `apiCall` Sends to Wrong Endpoint
**File:** `src/components/hermes-kanban/HermesKanbanDrawer.tsx`

The drawer's `apiCall()` function was sending ALL actions (comment, block, complete, archive, assign, unblock, link) to the generic `POST /api/orchestration/hermes-kanban` endpoint, which only handles **task creation**. This meant:
- Clicking "Comment" would try to create a new task with the comment text as title
- Clicking "Block/Unblock/Archive" would also attempt creation instead of the actual action
- The separate sub-endpoints existed (`/comment`, `/block`, `/complete`, `/assign`) but were never called

**Fix:** Replaced the flat `fetch("/api/orchestration/hermes-kanban")` call with an action-to-route mapping table that dispatches to the correct sub-endpoint for each action.

### 🐛 Found & Fixed: Bridge `--json` Flag on Non-JSON Commands
**File:** `src/lib/hermes-kanban-bridge.ts`

The `hermesCli()` function appended `--json` to every CLI command. Subcommands like `comment`, `block`, `unblock`, `archive`, `assign`, `reclaim`, `reassign`, `complete`, `edit`, `link`, `unlink` do NOT support `--json`, causing all bridge calls to fail.

**Fix:** Created `hermesCliNoJson()` wrapper for non-JSON subcommands. Updated 9 bridge functions to use it.

### 🐛 Found & Fixed: Title Editing Didn't Work
**Files:** `src/app/api/orchestration/hermes-kanban/[id]/route.ts`, `src/lib/hermes-kanban-bridge.ts`, `src/components/hermes-kanban/HermesKanbanDrawer.tsx`

The drawer's "click to edit title" sent `{ action: "edit", result, summary }` to the PATCH endpoint, which just re-set the same result/summary without ever updating the title. The `editTask` bridge function also only supports `result`/`summary`/`metadata` — no title support.

**Fix:** Added `updateTaskMeta()` to the bridge (direct SQLite write for metadata-only fields), updated the PATCH route to handle `title`/`body` updates, and fixed the drawer to send `{ title: "..." }` instead of the broken `{ action: "edit", ... }`.

### 🐛 Found & Fixed: Drag-and-Drop Routing to Wrong Endpoint
**File:** `src/app/orchestration/hermes-kanban/page.tsx`

The `handleDropCard` sent `{ action: newStatus }` to the generic PATCH endpoint, which only handles `{ result, summary, metadata, title, body }`. Drop-to-done, drop-to-blocked, and drop-to-archived would fail.

**Fix:** Routes to the correct sub-endpoint based on target status: `complete` for done, `block` for blocked, `DELETE` for archived. Informational messages for statuses not directly settable (triage, todo, running).

### ⚠️ Found: Missing `/api/cards/batch` Endpoint
**Files:** `src/app/orchestration/hermes-kanban/page.tsx`, `src/components/hermes-kanban/BatchActionToolbar.tsx`

The `handleBatchAction()` function sends to `POST /api/cards/batch` — this endpoint does **not exist**. The selection UI (checkboxes, column select-all, BatchActionToolbar) is fully rendered but clicking any batch action (change status, archive, assign) will hit a 404. The toolbar's status options also use non-kanban values (`in-progress`, `review`) instead of kanban statuses (`running`, `ready`, `blocked`).

**Recommendation:** Create `/api/cards/batch` endpoint or route individual actions through the existing per-card endpoints in a loop.

### ⚠️ Found: Inline Create Status Display Mismatch
Creating a task with "Create task in To Do" lands in "Ready" (CLI default) with toast explaining the limitation. This is a known Hermes CLI limitation but the UX is confusing.

---

## 2. GOALS PAGE — Assessment

### ✅ Working Features
- Goal creation with title, description, priority (P1-P5), tenant tag
- Checkpoint system: create multiple checkpoints, mark complete, remove
- Progress bar (calculated from completed/total checkpoints)
- Goal detail drawer with status badge, priority, description, timestamps
- Kanban linker: search by title or ID, display linked tasks with status badges
- Delete goal with confirmation
- Edit goal (button present in drawer)
- Category/tags display
- Mission and parent goal display

### ✅ Verified Working: Kanban Task Linking
Searching for kanban tasks in the linker works correctly. The `GoalKanbanLinker` fetches from `/api/orchestration/hermes-kanban` (correct endpoint after prior fix). Tasks display ID, status, title, and priority. Linked tasks show with status badge and unlink button.

### ⚠️ Found: Checkpoint Text Rendering Issue
The first checkpoint's text doesn't appear in the accessibility tree when the goal detail drawer opens. Text shows properly for the second checkpoint. Possible rendering issue.

### ⚠️ Found: No Goal Status Transitions
Goals have `status` field (`active`, `in_progress`, `completed`, `archived`) but there's no UI to transition between them. The status badge in the detail drawer is purely display-only. Users can complete checkpoints but cannot mark a goal as "completed" or "archived" from the UI.

---

## 3. CHAT PAGE — Assessment

### ✅ Working Features
- Streaming responses via SSE from Hermes Gateway API Server
- Session management (auto-create, sidebar list, switch between sessions)
- Model selector (hermes-agent, deepseek-v4-flash, claude-sonnet-4)
- Markdown rendering (code blocks with copy button, inline code, bold, italic)
- Auto-scroll to latest message
- Keyboard shortcuts (Enter to send, Shift+Enter for newline)
- Clear conversation button
- Per-session message history (in-memory)
- Auto-generated session titles (first message text)

### ✅ Verified: Gateway Integration
The proxy to `localhost:8642/v1/chat/completions` works correctly. Both streaming and non-streaming modes work. The gateway returns proper SSE-formatted responses.

### ⚠️ Found: Sessions Are In-Memory Only
Sessions are stored in React state — they disappear on page refresh. No persistence to Hermes session store or local storage.

### ⚠️ Found: No Session Deletion
Users can create and switch sessions but cannot delete old ones. The sidebar caps at 50 sessions.

### ⚠️ Found: No Loading State During Streaming
While streaming, there's a spinner on the send button but no indication in the message area that the assistant is responding (empty message bubble shows "Thinking..." only when content is empty).

---

## 4. NATIVE HERMES KANBAN — Feature Gap Analysis

Comparing Control Hub's wrapper against the native Hermes Kanban system:

| Feature | Native Hermes | Control Hub | Gap |
|---------|--------------|-------------|-----|
| 7-column board | ✅ | ✅ | None |
| Drag-and-drop | ✅ | ✅ (partial) | Drop to todo/ready/running not supported |
| Card creation with all flags | ✅ | ✅ | Full coverage |
| Detail drawer | ✅ | ✅ | Feature-complete |
| Comments | ✅ | ✅ | Working (after fix) |
| Block/unblock | ✅ | ✅ | Working (after fix) |
| Complete with summary/metadata | ✅ | ✅ | Working (after fix) |
| Task dependencies | ✅ | ✅ | Link/unlink in drawer |
| Batch operations | ✅ | ❌ | No API endpoint |
| Multi-board | ✅ | ✅ | Board switcher works |
| SSE live updates | ✅ | ❌ | Uses 10s polling instead |
| Dashboard plugin REST API | ✅ | ❌ | Uses own SQLite reads |
| Worker diagnostics | ✅ | ✅ | Diagnostics button |
| Task search/filter | ✅ | ✅ | Server-side + client-side |
| Profile assignees | ✅ | ✅ | Working |
| Claim/reclaim | ✅ | ✅ | Working via drawer |
| Reassign | ✅ | ✅ | Working via drawer |
| Specify triage | ✅ | ✅ | Working |
| Title editing | ✅ | ✅ | Working (after fix) |
| Body editing | ✅ | ✅ | Working (after fix) |
| Session persistence | ❌ (N/A) | ❌ | Chat sessions lost on refresh |
| Goal status transitions | ❌ (N/A) | ❌ | No UI for status changes |
| Goal → Kanban linking | ❌ (N/A) | ✅ | Unique Control Hub feature |

---

## 5. FIXES APPLIED IN THIS SESSION

| # | Issue | Severity | Files Changed |
|---|-------|----------|--------------|
| 1 | Drawer `apiCall` routes to wrong endpoint | **Critical** | `HermesKanbanDrawer.tsx` |
| 2 | Bridge CLI `--json` on unsupported commands | **Critical** | `hermes-kanban-bridge.ts` |
| 3 | Title editing doesn't work | **High** | `hermes-kanban-bridge.ts`, `[id]/route.ts`, `HermesKanbanDrawer.tsx` |
| 4 | Drag-and-drop routes to wrong endpoint | **High** | `page.tsx` |

---

## 6. RECOMMENDATIONS — Next Steps

### P0 — Critical (Blocks User Workflow)
1. **Create `/api/cards/batch` endpoint** — The batch selection UI is fully rendered but every action hits a 404. This is the No. 1 blocker for the batch operations feature. Either create a dedicated batch endpoint or loop through per-card endpoints in the frontend.

### P1 — High (Significant UX Degradation)
2. **Add Chat session persistence** — Store sessions in Hermes session store or localStorage so conversations survive page refreshes. Currently all messages are lost on reload.
3. **Add goal status transitions** — Let users mark goals as `completed` or `archived` from the detail drawer. Currently checkpoints can be completed but the goal itself never transitions.
4. **Align BatchActionToolbar statuses with kanban** — Replace `in-progress`/`review` with `running`/`ready`/`blocked`/`done` to match the actual kanban system.

### P2 — Medium (Quality of Life)
5. **Add Chat session deletion** — Users can create unlimited sessions but cannot clean up old/test ones.
6. **Add streaming indicator** — Show a "typing" animation or cursor while the assistant response is being streamed.
7. **Fix checkpoint text rendering** — Investigate why the first checkpoint text doesn't appear in the accessibility tree.
8. **Add inline create status feedback** — When creating from a column button, optionally redirect to the detail drawer for status setting.

### P3 — Nice to Have
9. **Replace polling with SSE** — Native Hermes supports live event streaming via `hermes kanban tail`. Switch from 10s polling to SSE for real-time updates.
10. **Add keyboard shortcuts** — `n` for new task, `g` then `k`/`g`/`c` for page navigation, `ESC` to close drawer.
11. **Add inline task sorting** — Priority ordering within columns.
12. **Add pagination/task limit indicator** — Currently capped at 200 tasks with no "load more" option.
13. **Add multi-board awareness** — Different boards should have independent filters and selection states.
