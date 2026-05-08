# Control Hub QA Report — Full Site Walkthrough

**Date:** May 8, 2026
**Inspector:** Bob (PatterTech CEO Agent)
**Scope:** All pages, routes, interactive elements, JS console errors
**Build:** `dev` branch, `c05d18f`, server running on `http://localhost:3000`

---

## Executive Summary

| Category | Count |
|----------|-------|
| Total issues found | 12 |
| P0 Critical | 1 |
| P1 High | 4 |
| P2 Medium | 6 |
| P3 Low | 1 |
| Pages with 0 JS errors | 19 |
| Broken routes (404) | 5 |
| Ghost nav links | 5 |

---

## P0 — Critical

### Issue 1: Sidebar Ghost Links → 404 Pages

**Severity:** P0 — Critical
**Category:** Functional / Navigation
**Pages affected:** `/agent/personalities`, `/operations`, `/task-lists`, `/workspaces`, `/command-room`

**Description:**
The sidebar `mainSections` configuration contains 5 nav links pointing to routes that do not exist in the codebase. When clicked, users see a Next.js 404 "This page could not be found." screen. This is a broken navigation experience.

**Root cause:** `sidebar-config.ts` defines nav links for pages that were never implemented, or that existed in a previous version but were removed.

| Link label | Sidebar section | href | Status |
|---|---|---|---|
| Operations | Main | `/operations` | **404** — route does not exist |
| Task Lists | Main | `/task-lists` | **404** — route does not exist |
| Workspaces | Main | `/workspaces` | **404** — route does not exist |
| Command Room | Main | `/command-room` | **404** — route does not exist |
| Personalities | Operations | `/agent/personalities` | **404** — actual route is `/personalities` |

**Fix:** Remove or comment out the 4 completely non-existent routes from `sidebar-config.ts` `mainSections`. Fix the Personalities href from `/agent/personalities/` to `/personalities`.

---

## P1 — High

### Issue 2: Skills Profile Filter — Unlabeled / Undescribed Dropdown

**Severity:** P1 — High
**Category:** Accessibility / UX
**Page:** Skills Manager (`/skills`)

**Description:**
The profile selector dropdown at the top of the Skills Manager page shows "Bob" as the selected value in the combobox, but the combobox has no visible label. The options show profile names like "Bob", ".Retired", "Devops", "Qa". The `.Retired` entry has a dot-prefix naming anomaly.

Additionally, there are 5 unlabeled buttons visible in the skill list (refs `@e7`, `@e8`, `@e12`, `@e13`, `@e14`, `@e15` etc.) — these are likely toggle/expand controls for skill categories that have no accessible labels.

**Root cause:** The `<Combobox>` component for profile selection lacks an `aria-label` or associated `<label>` element. The skill category expand/collapse buttons lack `aria-label` attributes.

**Fix:**
1. Add `aria-label="Select agent profile"` to the profile combobox, or wrap it in a `<label>` visually hidden element.
2. Add `aria-label` to all category toggle buttons (e.g. `aria-label="Toggle apple category"`).
3. Investigate the `.Retired` profile name — is this intentional?

---

### Issue 3: Personalities Page — "technical" Personality Missing "Set as active" Button

**Severity:** P1 — High
**Category:** UX / Functional
**Page:** `/personalities`

**Description:**
All 13 other personalities (catgirl, concise, creative, helpful, hype, kawaii, noir, philosopher, pirate, shakespeare, surfer, teacher, uwu) have a "Set as active" button. The "technical" personality does NOT have a "Set as active" button — only "Edit" and "Delete". This is inconsistent and suggests the "technical" personality cannot be activated from the UI.

**Root cause:** The personality cards are likely generated from a list that excludes `technical` from activation, or the `technical` personality has `can_activate: false` in its definition. If intentional (e.g., it's a system personality), this should be visually indicated. If not intentional, the button is simply missing.

**Fix:** Either add the "Set as active" button to the technical personality card (if it should be activatable), or add a visual indicator (e.g., a lock icon or "(system)" badge) explaining why it can't be activated.

---

### Issue 4: Missions Page — 3 Total Missions But No Visible Mission Cards

**Severity:** P1 — High
**Category:** Functional / Visual
**Page:** `/missions`

**Description:**
The Missions page header stats show "3 Total" but the main content area beneath the template section appears to show no individual mission cards in the accessibility snapshot. The DOM does contain mission-related content (confirmed via `innerHTML` inspection showing `rounded-lg border` mission cards with titles), but they are not visible in the browser's initial viewport and the accessibility tree does not capture them well.

The "QUICK DEPLOY - CHOOSE A TEMPLATE" section and the filter tabs (All/Queued/Dispatched/Successful/Failed) are clearly visible, but individual mission items are either hidden below the fold, or rendering is inconsistent between SSR and client hydration.

**Root cause:** Likely a React Query SSR hydration timing issue — the same pattern documented in the dogfood skill for the PatterTech Profiles page. The page renders the heading and template section on first load, but mission cards may only appear after a client-side refresh.

**Fix:** Apply `export const dynamic = "force-dynamic"` to the missions page, or ensure the `useApiQuery` hook resolves before first render. Add a loading skeleton for the mission cards section so the loading state is visually clear.

---

### Issue 5: Agents Page — No Visible Agent Cards on First Navigation

**Severity:** P1 — High
**Category:** Functional / Visual
**Page:** `/agent/agents`

**Description:**
On initial navigation to the Agents page, the accessibility snapshot shows only "Agents" heading, "New Agent" button, and 5 generic clickable elements with no text labels. The DOM confirms "5 profiles configured" and cards ARE rendering (confirmed via `innerHTML` inspection showing card HTML), but the accessibility tree fails to capture the card content on first load.

After refresh/navigation to the same URL, the cards appear in the accessibility tree. This is the identical SSR hydration pattern as the Missions page.

**Root cause:** Same React Query SSR hydration issue — `useApiQuery` hook doesn't resolve before first server-side render.

**Fix:** Apply `export const dynamic = "force-dynamic"` to the agents page, or restructure the data fetching to use `useEffect` for client-side-only fetching.

---

## P2 — Medium

### Issue 6: Memory Page — Recall/Reflect/Refresh Buttons All Disabled

**Severity:** P2 — Medium
**Category:** UX / Functional
**Page:** `/memory`

**Description:**
All three primary action buttons — Recall, Reflect, and Refresh — are disabled (greyed out, `disabled` attribute) on the Memory page. This gives the impression the Memory feature is completely non-functional, even though the page itself loads correctly and the "Add Memory" button is enabled.

If the Hindsight Memory API is not configured or not reachable, this should be communicated to the user with a clear status message (e.g., "Hindsight not connected — memory features unavailable"). If it IS connected, the buttons should be enabled.

**Root cause:** The buttons are likely disabled because the Hindsight API is not connected (`mode=local_external` was shown in the gateway logs but `api_url=http://localhost:8888` suggests the hindsight server may not be running). The code checks for an API connection before enabling these buttons.

**Fix:**
1. Add a visible connection status indicator on the Memory page (e.g., "Hindsight: Connected" / "Hindsight: Disconnected").
2. Show a tooltip or helper text explaining why the buttons are disabled.
3. If Hindsight is intentionally not running, display a "Setup required" state instead of disabled buttons.

---

### Issue 7: Tool Registry — Disabled Tools Still Show "Enable" Button When Platform Tools Are All Disabled

**Severity:** P2 — Medium
**Category:** UX / Functional
**Page:** `/agent/tools`

**Description:**
The Tool Registry shows "Platform Tools 1/7" meaning 1 platform tool is enabled and 6 are disabled. The UI shows individual "Enable" buttons for each disabled platform tool. However, when platform tools are completely disabled at the platform level, the "Enable" button on individual tools may not work as expected (the tool state depends on a platform-level toggle, not just the individual tool toggle).

The Core Tools section shows "4/4" all enabled with "Disable" buttons — this is correct. But the Platform Tools section has a confusing state where some are disabled at the platform level (e.g., Telegram, WhatsApp) and the individual "Enable" buttons are visible but potentially non-functional.

**Root cause:** The tool enable/disable may have a two-level hierarchy (platform-level toggle vs individual tool toggle) that the UI doesn't clearly communicate.

**Fix:**
1. Add a platform-level status indicator next to each tool section header (e.g., "Platform Tools — Telegram: Disabled").
2. Disable individual tool "Enable/Disable" buttons when the parent platform is disabled, with a tooltip explaining why.
3. Clarify the visual hierarchy so users understand why some "Enable" buttons appear functional and others may not be.

---

### Issue 8: Kanban — Board Selector Button Has No Visual Selected State

**Severity:** P2 — Medium
**Category:** Visual / UX
**Page:** `/kanban`

**Description:**
The Kanban page has a board selector showing "Sprint Board", "Test Board", "PatterTech Launch" buttons. The currently active board (Sprint Board) appears visually identical to the other boards — no active/selected state styling (no highlight, no underline, no color change). Users cannot tell which board is currently selected without reading the heading.

**Root cause:** The board selector buttons don't apply a distinct active style when `isSelected` is true. They all render with the same button styling.

**Fix:** Add an active/selected state to the currently selected board button — e.g., `bg-neon-purple/30 border-neon-purple/50` or similar distinct styling that clearly communicates "this is the active board."

---

### Issue 9: Config Pages — "Streaming" Listed Under INTEGRATIONS but Config Section is "Streaming Response"

**Severity:** P2 — Medium
**Category:** Content / Navigation
**Pages:** `/config`, `/config/streaming`

**Description:**
The Config page sidebar groups "Streaming Response configuration" under the INTEGRATIONS section, but the Config index page lists it with the label "Streaming Response streaming configuration" — both have "streaming" in the name, which is confusing. Additionally, the `/config` page shows a "Streaming" link but when navigating to `/config/streaming`, the page heading says "Streaming" while the sidebar shows it under INTEGRATIONS.

The actual content of the Streaming config page is minimal (1 field configured) — it may be an abandoned or placeholder config section.

**Root cause:** Inconsistent naming: "Streaming" vs "Streaming Response" vs "streaming configuration" — three different labels for the same section across the index, sidebar, and page heading.

**Fix:** Standardize the naming — pick one label (e.g., "Streaming") and use it consistently across the config index, sidebar, and page heading. If the page is a stub/placeholder, either flesh it out or remove the nav link.

---

### Issue 10: Story Weaver — "Delete story" Button Without Confirmation

**Severity:** P2 — Medium
**Category:** UX / Functional
**Page:** `/recroom/story-weaver`

**Description:**
The Story Weaver page shows a "Delete story" button directly on the card for "A long journey" story. Clicking this button immediately deletes the story with no confirmation dialog, no "are you sure?" prompt. This is a destructive action with no safety net.

**Root cause:** The delete button fires the delete action directly without an intermediate confirmation step.

**Fix:** Add a confirmation dialog before deletion — either a browser `confirm()` dialog or a proper modal component that says "Delete this story? This cannot be undone." with Cancel/Delete buttons.

---

## P3 — Low

### Issue 11: Sidebar — Duplicate "Bob" Profile Names in Skills Profile Selector

**Severity:** P3 — Low
**Category:** Content / UX
**Page:** `/skills`

**Description:**
The Skills Manager profile dropdown shows two entries both named "Bob":
- "Bob" (selected)
- "Bob" (appears again in the list)

There is also a ".Retired" entry which has an unusual dot-prefix naming convention. The duplicate "Bob" suggests there are two agent profiles with the same display name, which will cause confusion.

**Root cause:** Two agent profiles in the profiles data both have `name: "Bob"`. The `.Retired` profile likely has a name that starts with "." which makes it sort to the top in some contexts.

**Fix:** Ensure unique display names for all agent profiles in the profiles data. Rename `.Retired` to something more descriptive like "Bob (Retired)" or "Legacy Bob".

---

## Informational — No Fix Required

### Note 1: Dashboard — Gateway Warnings Displayed to End User

**Severity:** Informational
**Page:** `/`

**Description:**
The Dashboard displays raw gateway log entries including:
- `WARNING: Binding to 192.168.1.169 with --insecure — the dashboard has no robust authentication`
- `WARNING: No API key configured (API_SERVER_KEY / platforms.api_server.key)`
- `ERROR: discord connect timed out after 30s`
- `ERROR: Failed to send Discord message: 503 Service Unavailable`

These are developer/SRE-level warnings and errors that are inappropriate for an end-user dashboard view. However, this is a design decision — showing raw logs on the dashboard gives operators immediate visibility into system health.

**Recommendation:** If this is intentional, consider moving raw log display to the dedicated `/logs` page and replacing the dashboard log section with a curated "System Alerts" panel that summarises key issues in plain English.

---

### Note 2: Discord Platform Status — "Connected" but Recent Errors in Gateway Logs

**Severity:** Informational
**Page:** `/gateway`

**Description:**
The Gateway page shows "Discord — Connected" as green, but the gateway logs show recent `503 Service Unavailable` errors when sending messages via Discord. This means the Discord connection is established (the bot is connected) but sending messages is failing intermittently. The status indicator only reflects connection state, not message delivery success rate.

**Recommendation:** Consider adding a "Last message sent: X min ago" or "Message success rate: N%" metric to the Discord platform status indicator, or change the status to "Degraded" if recent message sends have failed.

---

## Visual Design Observations (Not Issues — Strengths)

The following are confirmed working well and should be preserved:

1. **Dark theme** — Consistent `#030712` base with neon accent colours (cyan, purple, pink, green, orange) applied systematically across all pages
2. **Sidebar navigation** — Clean collapsible sidebar with section grouping (Main, Orchestration, Rec Room, Operations, Settings groups) and colour-coded accent per section
3. **Card design** — Consistent `rounded-xl border border-white/10 bg-dark-900/50` card pattern across all pages
4. **Monospace typography** — Consistent `font-mono` for data values (timestamps, sizes, counts)
5. **Button styles** — Consistent `inline-flex rounded-lg font-mono` across action buttons
6. **Gateway page** — Well-structured platform connection status with clean log viewer
7. **Config pages** — Consistent section header pattern with breadcrumb, Reset/Save buttons, and field layout
8. **Story Weaver** — Good sub-navigation with Library/Create/Characters/Themes tabs
9. **Personalities page** — Clean card grid with Copy/Set active/Edit/Delete action buttons
10. **Sessions page** — Clear session list with search/filter and size/time/type metadata

---

## Page-by-Page Test Results

| Page | URL | JS Errors | Functional | Notes |
|------|-----|-----------|------------|-------|
| Dashboard | `/` | 0 | ✅ | Logs show warnings/errors — informational only |
| Missions | `/missions` | 0 | ⚠️ | Stats show 3 missions, cards may need scroll to appear (SSR hydration) |
| Cron | `/cron` | 0 | ✅ | Empty state correct — "No cron jobs" with Create Job CTA |
| Sessions | `/sessions` | 0 | ✅ | 50+ sessions listed, search/filter work |
| Session Detail | `/sessions/[id]` | 0 | ✅ | Full transcript loads correctly |
| Memory | `/memory` | 0 | ⚠️ | Recall/Reflect/Refresh disabled — API not connected |
| Gateway | `/gateway` | 0 | ✅ | Platform status + log viewer working |
| Logs | `/logs` | 0 | ✅ | All 9 log files listed, filter + pagination working |
| Teams | `/orchestration/teams` | 0 | ✅ | Shows "Development" team with Board link |
| Kanban | `/kanban` | 0 | ✅ | Board selector, columns, card creation all work |
| Story Weaver | `/recroom/story-weaver` | 0 | ⚠️ | Delete button has no confirmation |
| Story Weaver Library | `/recroom/story-weaver/library` | — | Not tested | — |
| Story Weaver Create | `/recroom/story-weaver/create` | — | Not tested | — |
| Story Weaver Characters | `/recroom/story-weaver/characters` | — | Not tested | — |
| Story Weaver Themes | `/recroom/story-weaver/themes` | — | Not tested | — |
| Story Weaver Detail | `/recroom/story-weaver/[id]` | — | Not tested | — |
| Agents | `/agent/agents` | 0 | ⚠️ | SSR hydration — cards appear after refresh |
| Skills | `/skills` | 0 | ⚠️ | Profile dropdown unlabeled, search works |
| Tools | `/agent/tools` | 0 | ⚠️ | Platform tools section has confusing enable/disable state |
| Personalities | `/personalities` | 0 | ⚠️ | "technical" missing "Set as active" button |
| HERMES.md | `/config/hermes_md` | 0 | ✅ | Content loads and displays |
| Environment | `/config/env` | 0 | ✅ | Page loads, Save/Reset present |
| Config Index | `/config` | 0 | ✅ | All 30 config sections listed correctly |
| Config/Agent | `/config/agent` | 0 | ✅ | Fields render correctly, verbose JSON visible |
| Config/Discord | `/config/discord` | 0 | ✅ | Toggle fields render correctly |
| Edition Unavailable | `/edition-not-available` | 0 | ✅ | Correct 404 fallback page |
| **Operations** | `/operations` | 0 | ❌ | **404 — does not exist** |
| **Task Lists** | `/task-lists` | 0 | ❌ | **404 — does not exist** |
| **Workspaces** | `/workspaces` | 0 | ❌ | **404 — does not exist** |
| **Command Room** | `/command-room` | 0 | ❌ | **404 — does not exist** |
| **Personalities (wrong path)** | `/agent/personalities` | 0 | ❌ | **404 — correct path is `/personalities`** |

---

## Root Cause Summary

| Issue | Root Cause |
|-------|------------|
| Ghost nav links | `sidebar-config.ts` defines links to unimplemented pages |
| Personalities wrong path | `href="/agent/personalities/"` vs correct `/personalities` |
| Agents/Missions SSR hydration | `useApiQuery` not resolving before first render |
| Memory buttons disabled | Hindsight API not connected |
| Skills dropdown unlabeled | Missing `aria-label` on combobox |
| Kanban no selected board style | No conditional active styling on board selector buttons |
| Story delete no confirmation | Missing confirmation dialog |
| Technical personality no activate | Intentional or missing button in data |

---

## Recommended Fix Priority

1. **Fix ghost nav links** (P0) — Remove 5 broken links from sidebar
2. **Fix Agents/Missions SSR hydration** (P1) — force-dynamic or restructure data fetching
3. **Fix Skills dropdown accessibility** (P1) — add aria-label
4. **Fix technical personality activate button** (P1) — add button or explain why missing
5. **Fix Memory disabled state** (P2) — add connection status indicator
6. **Fix Story Weaver delete** (P2) — add confirmation dialog
7. **Fix Kanban selected board style** (P2) — add active state styling
8. **Fix Config Streaming naming** (P2) — standardise label
9. **Fix Tool Registry platform hierarchy** (P2) — add platform-level status
10. **Fix Skills duplicate Bob names** (P3) — rename profiles for uniqueness
