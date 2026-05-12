# Pi.dev Agent Framework — Comprehensive Integration Review

**Prepared by Bob** | *May 12, 2026*

For: Daniel — Control Hub Multi-Framework Assessment

---

## Executive Summary

Pi.dev (created by Mario Zechner, author of libGDX) is a **minimal, open-source terminal coding agent** with a deliberately stripped-down architecture: four core tools (read, write, edit, bash), extensible via TypeScript modules, and available as an npm package. It offers a well-designed **multi-agent backend pattern** in Control Hub, meaning adding Pi.dev as a second framework is technically feasible and well-supported by the existing architecture. However, Pi.dev is fundamentally a **coding agent**, not a general-purpose conversational assistant like Hermes — this distinction shapes what Control Hub can and cannot do with it.

**Bottom line: Yes, Pi.dev can be integrated.** The Control Hub already has an `AgentBackend` interface, framework registry, and agent registry designed for this exact scenario. The integration requires creating a new backend implementation, updating the framework registry, and building a pi-specific config sync layer. Estimated effort: **5–8 files new/modified across ~600–900 lines of code.**

---

## 1. Pi.dev Framework Analysis

### 1.1 Architecture Overview

Pi.dev is a Node.js/TypeScript monorepo (`badlogic/pi-mono`) split into layered packages:

| Package | Purpose |
|---------|---------|
| `pi-ai` | Unified LLM communication layer — handles providers, model lists, API calls |
| `pi-agent-core` | Core agent execution loop with tool calling and event streaming |
| `pi-coding-agent` | Domain-specific coding agent — built-in tools, session persistence, extensions |
| `pi-tui` | Terminal UI library for building CLI interfaces |

### 1.2 Execution Modes (Critical for Integration)

Pi.dev supports **four execution modes**:

| Mode | Description | Integration Relevance |
|------|-------------|----------------------|
| **Interactive** | Full TUI experience | Not useful for Control Hub |
| **Print** (`-p "query"`) | Single-shot execution, prints result to stdout | Useful for quick tasks |
| **JSON** (`--mode json`) | Event stream output in JSON format | Useful for status tracking |
| **RPC** (stdin/stdout JSONL protocol) | Headless bidirectional communication | **Primary integration point** |
| **SDK** | Embed as TypeScript module in other apps | Secondary option |

**The RPC mode is the golden path for Control Hub integration.** It provides a JSONL protocol over stdin/stdout specifically designed for embedding pi in external applications, IDEs, and automation pipelines. This mirrors how Control Hub currently spawns `hermes chat` as a detached subprocess.

### 1.3 Core Tool Set

Pi.dev ships with exactly four tools (deliberately minimal):

1. **Read** — File reading with hash-anchored content addressing
2. **Write** — File creation/overwrite
3. **Edit** — Hash-anchored edits (no manual line-number tracking)
4. **Bash** — Shell command execution

**What Pi.dev does NOT have (vs. Hermes):**
- No sub-agent spawning (by design — pi encourages tmux-based approaches or extensions)
- No plan mode (can be added via extensions)
- No MCP support built-in (must be built via extensions)
- No browser automation
- No cron/scheduling layer
- No memory system (Hindsight, vector stores, etc.)
- No skill system (has "skills" but they are README-based natural language instructions, not the same as Hermes skills)
- No voice/TTS/STT
- No platform integrations (Discord, Telegram, Slack, etc.)

### 1.4 Provider/Model Support

Pi.dev supports significantly more providers than Hermes out of the box:
- **Subscriptions:** Anthropic Claude Pro/Max, OpenAI ChatGPT Plus/Pro, GitHub Copilot
- **API Keys:** Anthropic, OpenAI, Azure OpenAI, DeepSeek, Google Gemini, Google Vertex, Amazon Bedrock, Mistral, Groq, Cerebras, xAI, HuggingFace, Kimi, MiniMax, OpenRouter, Ollama
- **Custom Providers:** Via `pi.registerProvider()` in extensions

Configuration via `~/.pi/agent/models.json` (provider/model registration) and settings files in the dotfiles directory.

### 1.5 Extension System

Pi.dev's primary extensibility mechanism is **TypeScript extensions**:
- Loaded via jiti (no compilation needed)
- Can add custom tools, commands, keyboard shortcuts, and event handlers
- Full access to the TUI and tool system
- Packageable as npm/git packages ("Pi Packages")
- Extensions receive lifecycle events: `session_start`, `resources_discover`, `input`, `before_agent_start`, `agent_start`, `message_start`, `message_update`, `message`

### 1.6 Session Persistence

Pi.dev maintains sessions with:
- Conversation history persistence
- Working directory awareness
- Session state saved to dotfiles directory (`~/.pi/`)

---

## 2. Control Hub Architecture Analysis

### 2.1 Current Multi-Framework Design

The Control Hub was **designed from the start to support multiple agent frameworks**. Key architectural decisions:

#### `AgentBackend` Interface (`src/lib/agent-backend/index.ts`)

A TypeScript interface that all agent backends must implement:

```typescript
export interface AgentBackend {
  readonly name: string;
  readonly id: string;
  // Profiles
  listProfiles(): Promise<AgentProfile[]>;
  getProfile(id: string): Promise<AgentProfile | null>;
  createProfile(input: CreateProfileInput): Promise<AgentProfile>;
  updateProfile(id: string, input: Partial<CreateProfileInput>): Promise<AgentProfile>;
  deleteProfile(id: string): Promise<void>;
  // Execution
  dispatchMission(input: DispatchMissionInput): Promise<Mission>;
  getMissionStatus(missionId: string): Promise<MissionStatus>;
  getMissionSessionId(missionId: string): Promise<string | null>;
  syncMission(missionId: string, updates: { prompt?: string; name?: string }): Promise<void>;
  // Tools
  listTools(): Promise<ToolDefinition[]>;
  configureTool(pluginId: string, enabled: boolean): Promise<void>;
  // LLM
  callLLM(messages: LLMMessage[], opts?: LLMOptions): Promise<LLMResponse>;
  // Health
  ping(): Promise<boolean>;
}
```

**26 methods to implement** for each new backend.

#### Backend Factory (`src/lib/backends/index.ts`)

Currently hardcoded to Hermes:
```typescript
let _backend: AgentBackend | null = null;
export function getAgentBackend(): AgentBackend {
  if (_backend) return _backend;
  _backend = new HermesAgentBackend();
  return _backend;
}
```

#### Framework Registry (`src/lib/framework-registry.ts`)

Simple metadata registry:
```typescript
export const FRAMEWORKS: FrameworkEntry[] = [
  {
    id: "hermes",
    label: "Default Hermes",
    description: "The standard Hermes agent installed at ~/.hermes/",
    icon: "Server",
    filesystemRootDescription: "~/.hermes/*",
  },
];
```

#### Agent Registry (`src/lib/agent-registry.ts`)

JSON-based registry at `data/agents-registry.json`. Currently holds only Hermes:
```json
{
  "version": 1,
  "activeAgentId": "default",
  "agents": [{ "id": "default", "label": "Default Hermes", "framework": "hermes", "filesystemRoot": "/home/daniel/.hermes" }]
}
```

### 2.2 Hermes-Specific Integration Points

These modules are **tightly coupled to Hermes** and need pi.dev-specific equivalents or abstraction:

| Module | Hermes Coupling | Pi.dev Impact |
|--------|----------------|---------------|
| `hermes-agent-runtime.ts` | Reads Hermes paths, resolves LLM endpoints | Need parallel pi.dev runtime module |
| `hermes-config-sync.ts` | Writes to `~/.hermes/config.yaml` and `.env` | Pi uses `~/.pi/agent/` — different config format |
| `hermes-import.ts` | Parses Hermes config.yaml for model discovery | Need pi.dev config parser |
| `hermes-paths.ts` | Builds path bundle for Hermes directories | Need pi.dev path bundle |
| `hermes-providers.ts` | Maps provider names to env vars | Pi uses different auth patterns (OAuth + API key) |
| `framework-registry.server.ts` | Persists active framework to Hermes home | Need framework-agnostic persistence |

---

## 3. Integration Requirements

### 3.1 Files to Create

| # | File | Purpose | Estimated Lines |
|---|------|---------|-----------------|
| 1 | `src/lib/backends/pi.ts` | PiAgentBackend implementing AgentBackend interface | ~350-450 |
| 2 | `src/lib/pi-agent-runtime.ts` | Pi.dev install paths, LLM endpoints, active agent resolution | ~80-120 |
| 3 | `src/lib/pi-config-sync.ts` | Write-through to ~/.pi/agent/ config files | ~150-200 |
| 4 | `src/lib/pi-import.ts` | Read pi.dev configs, produce upsert objects for registry | ~100-150 |
| 5 | `src/lib/pi-providers.ts` | Pi.dev provider model mappings and auth patterns | ~60-80 |

### 3.2 Files to Modify

| # | File | Change | Estimated Lines |
|---|------|--------|-----------------|
| 6 | `src/lib/framework-registry.ts` | Add `"pi"` entry to FRAMEWORKS array | +10 |
| 7 | `src/lib/framework-registry.server.ts` | Make framework persistence agnostic (already is, minor tweaks) | ~5-10 |
| 8 | `src/lib/agent-registry.ts` | Expand `HermesFrameworkId` type to `"hermes" | "pi"` | ~15-20 |
| 9 | `src/lib/backends/index.ts` | Multi-backend factory: select backend by active framework | ~20-30 |
| 10 | `src/lib/agent-backend/types.ts` | Add pi.dev-specific fields to DispatchMissionInput | ~10-15 |

### 3.3 Detailed Implementation Per Backend Method

#### `dispatchMission` — The Core Challenge

**Current Hermes approach:** Spawns `hermes chat -q "$PROMPT" --quiet --source control-hub-mission --pass-session-id` as a detached bash subprocess. Output is tee'd to `.session`, `.output.log`, and `.status.json` files.

**Pi.dev approach options:**

**Option A: RPC Mode (Recommended)**
```
pi --rpc < ~/.pi/commands.jsonl
```
- Open stdout/stdin streams to pi process
- Send JSONL commands: `{"type": "mission", "prompt": "...", "model": "anthropic/claude-sonnet-4"}`
- Listen for event stream responses: `{"type": "message_update", "content": "..."}`, `{"type": "mission_complete", "status": "success"}`
- More structured, better error reporting, real-time progress

**Option B: Print Mode**
```
pi -p "$PROMPT" --mode json
```
- Single-shot execution
- JSON output to stdout
- Simpler but no real-time streaming, no intermediate status

**Option C: SDK Embedding**
```typescript
import { createAgent } from "@mariozechner/pi-coding-agent";
const agent = createAgent({ model: "anthropic/claude-sonnet-4" });
const result = await agent.run(prompt);
```
- Most control, TypeScript-native
- Requires Control Hub to import pi npm package
- Best for Node.js integration

**Recommendation: Option A (RPC) for production, Option B (Print) for simple dispatch.** The RPC mode gives Control Hub real-time mission status, event streaming, and structured communication — matching what the Hermes approach provides via file-based status tracking.

#### `ping()` — Health Check

**Hermes:** `fetch(gatewayBase + "/health")` — hits the gateway's OpenAI-compatible endpoint.

**Pi.dev:** No built-in HTTP server. Health check would need to:
- Spawn a minimal pi command and check exit code, or
- Verify pi CLI is installed (`which pi`), or
- Use `pi --version` to confirm availability

#### `listTools()` — Tool Registry

**Hermes:** Returns Hermes toolsets (cli, telegram, discord, etc.) with categories.

**Pi.dev:** Pi has exactly 4 tools (read, write, edit, bash) plus extension-provided tools. The backend would:
- Return the 4 built-in tools
- Discover extension-provided tools from pi's extension registry
- Note: pi tools map to different categories — no platform tools (no Discord, Telegram, etc.)

#### `getMissionSessionId` — Session Tracking

**Hermes:** Reads `.session` file for pattern `session_id: <uuid>`.

**Pi.dev:** Session ID extraction depends on execution mode:
- RPC mode: Pi returns session metadata in the event stream
- Print mode: May not provide session IDs
- Need to check pi.dev's session file format

---

## 4. Key Differences and Design Gaps

### 4.1 Paradigm Mismatch

| Dimension | Hermes | Pi.dev |
|-----------|--------|--------|
| **Scope** | General-purpose AI agent (conversational + coding + platform integrations) | Coding agent only |
| **Tools** | 50+ tools across 8+ platforms (terminal, browser, web, discord, telegram, homeassistant, etc.) | 4 core tools (read, write, edit, bash) |
| **Configuration** | YAML config.yaml + .env (500+ lines) | JSON settings/models files (lighter) |
| **Sessions** | SQLite-based, multi-agent tracking | File-based, per-directory sessions |
| **Memory** | Hindsight, Holographic providers | None built-in |
| **Sub-agents** | Native delegate_task() | Not built-in (workaround: tmux, extensions) |
| **Cron** | Python scheduler in gateway | No scheduling layer |
| **Personas** | 12+ built-in personalities | None |
| **Skills** | SKILL.md files in external directories | "Skills" as README-style natural language instructions |

### 4.2 What Control Hub Needs to Handle Differently for Pi.dev

1. **No platform toolsets:** Pi doesn't have Discord/Telegram/Slack integrations. The Control Hub's platform toolsets config section would be irrelevant.
2. **No memory providers:** Pi has no equivalent to Hindsight. Memory features would be Hermes-only.
3. **Simpler config:** Pi's config is JSON-based in `~/.pi/agent/` rather than YAML. The entire config sync layer needs a new implementation.
4. **Different provider auth:** Pi supports OAuth subscriptions (Claude Pro, ChatGPT Plus) which is fundamentally different from Hermes's API key model.
5. **No gateway:** Pi doesn't run an HTTP gateway. The `/api/gateway` and LLM endpoint resolution logic would need pi.dev-specific handling or graceful degradation.

### 4.3 What Pi.dev Can Do That Hermes Can't (or Does Differently)

1. **Subscription-based model access:** Use existing ChatGPT Plus/Claude Pro subscriptions without API keys
2. **Hash-anchored file editing:** More precise file edits using content hashes
3. **Extension system:** TypeScript-first extension ecosystem with npm/git package sharing
4. **Minimal attack surface:** Four tools vs. 50+ — potentially safer for constrained environments
5. **More provider choices:** Wider out-of-the-box provider support (15+ vs Hermes's ~10)

---

## 5. Integration Architecture Proposal

### 5.1 High-Level Design

```
┌─────────────────────────────────────────────────┐
│              Control Hub (Next.js)               │
│                                                   │
│  ┌───────────┐    ┌───────────┐                  │
│  │  Hermes   │    │    Pi     │    ← New          │
│  │ Backend   │    │  Backend  │                   │
│  └─────┬─────┘    └─────┬─────┘                  │
│        │                 │                        │
│  ┌─────┴─────────────────┴─────┐                  │
│  │    AgentBackend Factory     │  ← Modified       │
│  └─────────────┬───────────────┘                  │
│                │                                  │
│     ┌──────────┼──────────┐                       │
│     │ Framework │ Registry │    ← Extended         │
│     │ (hermes,  │  (JSON)  │                       │
│     │    pi)    │          │                       │
│     └───────────┴──────────┘                       │
└─────────────────────────────────────────────────┘
                │         │
        ┌───────┘         └───────┐
    ~/.hermes/                ~/.pi/
    config.yaml               agent/
    .env                      models.json
    profiles/                 settings.json
    sessions/                 extensions/
```

### 5.2 Backend Selection Strategy

The proposed factory pattern:

```typescript
// src/lib/backends/index.ts
import { AgentBackend } from "../agent-backend";
import { HermesAgentBackend } from "./hermes";
import { PiAgentBackend } from "./pi";
import { getActiveFrameworkId } from "../framework-registry.server";

let _backends: Record<string, AgentBackend> = {};

export function getAgentBackend(): AgentBackend {
  const frameworkId = getActiveFrameworkId();
  if (!_backends[frameworkId]) {
    switch (frameworkId) {
      case "pi":     _backends[frameworkId] = new PiAgentBackend(); break;
      case "hermes": _backends[frameworkId] = new HermesAgentBackend(); break;
      default:       _backends[frameworkId] = new HermesAgentBackend();
    }
  }
  return _backends[frameworkId];
}
```

### 5.3 Agent Registry Schema Extension

```typescript
// src/lib/agent-registry.ts
export type AgentFrameworkId = "hermes" | "pi";

export interface AgentRegistryEntry {
  id: string;
  label: string;
  framework: AgentFrameworkId;          // Was: HermesFrameworkId
  filesystemRoot: string;
  gatewayBaseUrl?: string;
  llmBaseUrl?: string;
  // Pi.dev-specific:
  piBinaryPath?: string;               // e.g., "pi" or "/usr/local/bin/pi"
  piConfigDir?: string;                // e.g., "~/.pi/agent"
}
```

---

## 6. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Pi.dev API stability** | Medium | Pi.dev is early-stage; breaking changes likely. Pin specific npm version. |
| **RPC protocol undocumented** | Medium | Pi.dev's RPC mode has documentation but may lack version stability. Write integration tests. |
| **OAuth subscription complexity** | High | Subscription-based auth (Claude Pro, ChatGPT) requires browser-based OAuth — hard to automate from Control Hub server. |
| **No gateway endpoint** | Low | Control Hub's LLM proxy routes would return 404 for Pi. Need graceful degradation or pi.dev-specific LLM routing. |
| **Paradigm mismatch** | Medium | Users expect pi to have the same capabilities as Hermes. Need clear UI differentiation. |
| **File permission issues** | Low | Pi.dev may operate in different directories than Hermes. Path security layer handles both. |

---

## 7. Implementation Phases

### Phase 1: Framework Registration (1 file, ~25 lines)
- Add `"pi"` entry to `framework-registry.ts`
- Add `"pi"` to `agent-registry.ts` type union
- Update `defaultRegistry()` to include pi default entry
- Add entry to `data/agents-registry.json`

### Phase 2: Pi Backend Interface (1 file, ~150 lines stub)
- Create `src/lib/backends/pi.ts`
- Implement stub methods throwing "Not implemented" for complex methods
- Implement `ping()` and `listTools()` with basic pi CLI detection
- This proves the factory pattern works

### Phase 3: Config & Path Layer (3 files, ~350 lines)
- Create `src/lib/pi-agent-runtime.ts` — path resolution for `~/.pi/`
- Create `src/lib/pi-providers.ts` — provider model mappings
- Create `src/lib/pi-config-sync.ts` — JSON config write-through
- Create `src/lib/pi-import.ts` — config parser for model discovery
- Modify `src/lib/backends/index.ts` — multi-backend factory

### Phase 4: Mission Dispatch (modify pi.ts, ~200 additional lines)
- Implement `dispatchMission()` using RPC or print mode
- Implement `getMissionStatus()` — parse pi's output/events
- Implement `getMissionSessionId()` — extract from pi session data
- Implement `syncMission()` — update pi's working context files

### Phase 5: Profile Management (modify pi.ts, ~100 additional lines)
- Implement profile CRUD against pi's config system
- Pi's profile concept maps to working directory + session settings
- May require creating a wrapper profile directory structure

### Phase 6: UI Updates (existing pages, ~50-100 lines)
- Update agent switcher to show pi as selectable framework
- Update config page labels/sections to reflect active framework
- Update status page to show pi-specific health metrics

---

## 8. Recommendation

**Proceed with integration, but scope it as a second-class citizen.**

Pi.dev is a great coding agent but lacks the general-purpose capabilities (platform integrations, memory, sub-agents, cron, voice) that make Hermes valuable. Control Hub should integrate Pi as an **additional coding-focused framework** alongside Hermes, not a replacement:

- **Use Hermes as primary** for general tasks, cron jobs, platform integrations
- **Use Pi.dev as secondary** for coding-focused missions where its minimal, precise editing approach is beneficial
- **Framework switching** is already supported via the agent registry — users pick their active framework per agent

The integration effort is well-bounded (~600-900 lines across 8-10 files) and the Control Hub's existing `AgentBackend` pattern was designed exactly for this scenario.

---

## 9. Quick Reference: File Change Matrix

| File | Action | Type | Lines |
|------|--------|------|-------|
| `src/lib/framework-registry.ts` | Modify | Framework metadata | +10 |
| `src/lib/agent-registry.ts` | Modify | Expand type union | +15 |
| `src/lib/backends/index.ts` | Modify | Multi-backend factory | +25 |
| `src/lib/backends/pi.ts` | **Create** | PiAgentBackend impl | ~450 |
| `src/lib/pi-agent-runtime.ts` | **Create** | Path bundle + endpoints | ~100 |
| `src/lib/pi-config-sync.ts` | **Create** | JSON config sync | ~175 |
| `src/lib/pi-import.ts` | **Create** | Config parser | ~125 |
| `src/lib/pi-providers.ts` | **Create** | Provider mappings | ~70 |
| `data/agents-registry.json` | Modify | Add pi default entry | +8 |
| `src/lib/framework-registry.server.ts` | Modify | Minor tweaks | +5 |
| **Total** | | | **~983** |

---

*This review was compiled after examining 20+ Control Hub source files, 10+ Hermes configuration files, and research across pi.dev documentation, npm packages, GitHub repositories, and technical blog posts.*
