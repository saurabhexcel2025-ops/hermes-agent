// ═══════════════════════════════════════════════════════════════
// Chat Page — Web-based Hermes agent chat interface
// ═══════════════════════════════════════════════════════════════
// Streaming LLM responses via Hermes Gateway API Server.
// Supports: localStorage session persistence, session deletion,
// streaming, markdown rendering, code block copy, model selector.
// ═══════════════════════════════════════════════════════════════

"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  MessageCircle, Send, Plus, X, Download,
  Bot, User, Loader2, AlertTriangle, Square,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { CHAT_DEFAULT_MODEL, CHAT_MAX_SESSIONS } from "@/types/chat";
import type { ChatMessage, ChatSession } from "@/types/chat";
import {
  loadSessions,
  saveSessions,
  downloadFile,
  sessionToJson,
  sessionToCsv,
  renderMarkdown,
  formatModelName,
  createEmptySession,
  createUserMessage,
  createAssistantMessage,
  toApiMessages,
  readChatStream,
} from "@/lib/chat-utils";

// ── Typing indicator component ─────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start">
      <div className="w-8 h-8 rounded-lg bg-neon-purple/20 border border-neon-purple/30 flex items-center justify-center shrink-0 mt-1">
        <Bot className="w-4 h-4 text-neon-purple" />
      </div>
      <div className="max-w-[70%] rounded-xl px-4 py-3 bg-white/5 border border-white/10">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

// ── Shared streaming logic ─────────────────────────────────────

async function streamChatResponse(
  apiMessages: { role: string; content: string }[],
  sendModel: string,
  controller: AbortController,
  onDelta: (delta: string) => void,
  onError: (msg: string) => void,
): Promise<boolean> {
  try {
    const res = await fetch("/api/orchestration/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: apiMessages,
        model: sendModel,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      onError(err.error || "Chat request failed");
      return false;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError("No response stream available");
      return false;
    }

    await readChatStream(reader, onDelta);
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Intentional abort — no toast
      return false;
    }
    onError(err instanceof Error ? err.message : "Chat failed");
    return false;
  }
}

// ── Page component ─────────────────────────────────────────────

export default function ChatPage() {
  const { showToast } = useToast();

  // Sessions — initialized from localStorage
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [model, setModel] = useState(CHAT_DEFAULT_MODEL);
  const [gatewayModels, setGatewayModels] = useState<string[]>([CHAT_DEFAULT_MODEL]);
  const [registryModelIds, setRegistryModelIds] = useState<string[]>([]);
  const [modelLabels, setModelLabels] = useState<Record<string, string>>({});
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Current messages
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamGenRef = useRef(0);

  // Gateway connectivity check
  const [gatewayOnline, setGatewayOnline] = useState<boolean | null>(null);
  const [agentDefaultModelSet, setAgentDefaultModelSet] = useState<boolean | null>(null);

  // ── Helpers for session state mutation ──────────────────────

  const updateSessionMessages = useCallback(
    (sessionId: string, updater: (messages: ChatMessage[]) => ChatMessage[]) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, messages: updater(s.messages), updated_at: Date.now() }
            : s,
        ),
      );
    },
    [],
  );

  // ── Load persisted sessions from localStorage on mount ─────
  useEffect(() => {
    const saved = loadSessions();
    if (saved.length > 0) {
      setSessions(saved);
      setActiveSessionId(saved[0].id);
    }
  }, []);

  // ── Persist sessions to localStorage on every change ───────
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    saveSessions(sessions);
  }, [sessions]);

  // ── Fetch registry + gateway models ──────────────────────
  useEffect(() => {
    const fetchModels = async () => {
      setModelsLoading(true);
      setModelsError(null);
      const labels: Record<string, string> = {};
      let registryIds: string[] = [];
      let gateway: string[] = [CHAT_DEFAULT_MODEL];

      try {
        const [registryRes, gatewayRes] = await Promise.all([
          fetch("/api/models"),
          fetch("/api/gateway/models", { signal: AbortSignal.timeout(5000) }),
        ]);

        if (registryRes.ok) {
          const registryJson = await registryRes.json();
          const records = registryJson.data?.models as Array<{ modelId: string; name: string }> | undefined;
          if (Array.isArray(records)) {
            registryIds = records
              .map((m) => m.modelId)
              .filter((id): id is string => typeof id === "string" && id.length > 0);
            for (const m of records) {
              if (m.modelId) labels[m.modelId] = m.name;
            }
          }
        }

        if (gatewayRes.ok) {
          const gatewayJson = await gatewayRes.json();
          const ids: string[] = gatewayJson.data?.models || [];
          if (ids.length > 0) gateway = ids;
        } else {
          setModelsError("Gateway models unavailable");
        }
      } catch {
        setModelsError("Failed to load models");
      } finally {
        setRegistryModelIds(registryIds);
        setGatewayModels(gateway);
        setModelLabels(labels);
        setModelsLoading(false);
      }
    };
    fetchModels();
  }, []);

  // ── Gateway connectivity check ─────────────────────────────
  useEffect(() => {
    const checkGateway = async () => {
      try {
        const res = await fetch("/api/gateway/health", {
          method: "GET",
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const json = await res.json();
          setGatewayOnline(json.data?.online === true);
        } else {
          setGatewayOnline(false);
        }
      } catch {
        setGatewayOnline(false);
      }
    };
    checkGateway();
    const id = setInterval(checkGateway, 30000);
    return () => clearInterval(id);
  }, []);

  // ── Check if agent default model is set ────────────────────
  useEffect(() => {
    const checkAgentModel = async () => {
      try {
        const [defaultsRes, configRes] = await Promise.all([
          fetch("/api/models/defaults", { signal: AbortSignal.timeout(5000) }),
          fetch("/api/config", { signal: AbortSignal.timeout(5000) }),
        ]);
        let registryOk = false;
        if (defaultsRes.ok) {
          const defaultsJson = (await defaultsRes.json()) as {
            data?: { defaults?: { agent?: string } };
          };
          registryOk = Boolean(defaultsJson.data?.defaults?.agent?.trim());
        }
        let diskOk = false;
        if (configRes.ok) {
          const cfgJson = (await configRes.json()) as {
            data?: { model?: { default?: string } | string };
          };
          const modelCfg = cfgJson.data?.model;
          if (typeof modelCfg === "string") {
            diskOk = modelCfg.trim().length > 0;
          } else if (modelCfg && typeof modelCfg === "object") {
            diskOk = Boolean(String((modelCfg as Record<string, unknown>).default ?? "").trim());
          }
        }
        setAgentDefaultModelSet(registryOk && diskOk);
      } catch {
        setAgentDefaultModelSet(null);
      }
    };
    void checkAgentModel();
  }, []);

  // Get active session
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = useMemo(() => activeSession?.messages || [], [activeSession]);

  // Restore per-session model when switching sessions
  useEffect(() => {
    if (activeSession) {
      setModel(activeSession.model || CHAT_DEFAULT_MODEL);
    }
  }, [activeSessionId, activeSession]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Model change ────────────────────────────────────────────
  const handleModelChange = useCallback(
    (nextModel: string) => {
      setModel(nextModel);
      if (activeSessionId) {
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSessionId ? { ...s, model: nextModel } : s)),
        );
      }
    },
    [activeSessionId],
  );

  // ── New chat (creates session immediately) ─────────────────
  const handleNewChat = useCallback(() => {
    const newSession = createEmptySession(model);
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setInput("");
    inputRef.current?.focus();
  }, [model]);

  // ── Delete session ─────────────────────────────────────────
  const handleDeleteSession = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      abortControllerRef.current?.abort();
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (id === activeSessionId) {
          setTimeout(() => setActiveSessionId(next.length > 0 ? next[0].id : null), 0);
        }
        return next;
      });
      showToast("Session deleted", "success");
    },
    [activeSessionId, showToast],
  );

  // ── Download session ───────────────────────────────────────
  const handleDownloadJSON = useCallback(
    (s: ChatSession, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const filename = `${s.title.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now()}.json`;
      downloadFile(sessionToJson(s), filename, "application/json");
      showToast("Session exported as JSON", "success");
    },
    [showToast],
  );

  const handleDownloadCSV = useCallback(
    (s: ChatSession, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const filename = `${s.title.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now()}.csv`;
      downloadFile(sessionToCsv(s), filename, "text/csv");
      showToast("Session exported as CSV", "success");
    },
    [showToast],
  );

  // ── Send message ───────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    // Abort any existing stream
    abortControllerRef.current?.abort();
    const gen = ++streamGenRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Don't send if gateway is confirmed offline
    if (gatewayOnline === false) {
      showToast("Gateway is offline — start it with: hermes gateway start", "error");
      return;
    }

    // Determine or create the target session
    let targetSessionId = activeSessionId;
    let isNewSession = false;

    if (!targetSessionId) {
      isNewSession = true;
      const newSession = createEmptySession(model);
      targetSessionId = newSession.id;
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(targetSessionId);
    }

    // Create user and assistant messages
    const userMessage = createUserMessage(text);
    const assistantMessage = createAssistantMessage();
    const assistantId = assistantMessage.id;

    // Optimistically add messages
    updateSessionMessages(targetSessionId, (prev) => [
      ...prev,
      userMessage,
      assistantMessage,
    ]);

    // If new session, set the title from first message
    if (isNewSession) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId ? { ...s, title: text.slice(0, 50) } : s,
        ),
      );
    }

    setInput("");
    setIsStreaming(true);

    // Build API messages (for existing sessions, include history)
    const sessionAtSend = sessions.find((s) => s.id === targetSessionId);
    const priorMessages = isNewSession ? [] : (sessionAtSend?.messages ?? []);
    const apiMessages = toApiMessages(priorMessages, text);

    // Stream the response
    const success = await streamChatResponse(
      apiMessages,
      model,
      controller,
      (delta) => {
        updateSessionMessages(targetSessionId!, (prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m,
          ),
        );
      },
      (errMsg) => showToast(errMsg, "error"),
    );

    if (gen === streamGenRef.current) {
      setIsStreaming(false);
    }
  }, [input, activeSessionId, sessions, model, gatewayOnline, showToast, updateSessionMessages]);

  // ── Keyboard shortcuts ─────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ── Copy code block handler ────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("copy-btn")) {
        const code = target.getAttribute("data-code") || "";
        navigator.clipboard.writeText(code).then(() => {
          showToast("Code copied", "success");
        });
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showToast]);

  // ── Models for dropdown ────────────────────────────────────
  const mergedModels = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    const add = (id: string) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      merged.push(id);
    };
    add(CHAT_DEFAULT_MODEL);
    for (const id of registryModelIds) add(id);
    for (const id of gatewayModels) {
      if (id !== CHAT_DEFAULT_MODEL) add(id);
    }
    return merged;
  }, [registryModelIds, gatewayModels]);

  const displayModelName = useCallback(
    (id: string) => modelLabels[id] || formatModelName(id),
    [modelLabels],
  );

  // Only show sessions with messages in the sidebar
  const sessionList = useMemo(
    () => sessions.filter((s) => s.messages.length > 0).slice(0, CHAT_MAX_SESSIONS),
    [sessions],
  );

  const hasActiveSession = activeSession !== undefined;

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={MessageCircle}
        title="Chat"
        subtitle="Web-based Hermes agent interface"
        color="cyan"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={modelsLoading}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 outline-none focus:border-neon-purple/50 transition-colors font-mono cursor-pointer appearance-none max-w-[220px] disabled:opacity-50"
              title={modelsError ?? "Select model"}
            >
              {mergedModels.map((m) => (
                <option key={m} value={m}>{displayModelName(m)}</option>
              ))}
            </select>
            {modelsError && (
              <span className="text-[10px] text-neon-orange/80 font-mono" title={modelsError}>
                !
              </span>
            )}
            <Button
              variant="secondary"
              color="cyan"
              size="sm"
              icon={Plus}
              onClick={handleNewChat}
            >
              New Chat
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — only visible when there are sessions to show */}
        <div className="w-60 border-r border-white/10 bg-white/[0.01] flex flex-col">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">
              Sessions ({sessionList.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessionList.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={`w-full text-left px-3 py-2 border-b border-white/5 transition-colors hover:bg-white/5 group relative ${
                  s.id === activeSessionId ? "bg-white/10 border-l-2 border-l-neon-cyan" : ""
                }`}
                title={s.title}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white/70 truncate font-medium">
                      {s.title}
                    </div>
                    <div className="text-[10px] text-white/30 mt-0.5 font-mono">
                      {s.messages.length} message{s.messages.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  {/* Hover actions: download + delete */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <div className="relative group/download">
                      <button
                        onClick={(e) => handleDownloadJSON(s, e)}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-neon-cyan/20 hover:text-neon-cyan text-white/30"
                        title="Download as JSON"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <div className="absolute right-0 top-full mt-0.5 hidden group-hover/download:block z-50">
                        <button
                          onClick={(e) => handleDownloadCSV(s, e)}
                          className="whitespace-nowrap text-[10px] font-mono px-2 py-1 rounded bg-dark-900 border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors shadow-lg"
                        >
                          as CSV
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-neon-red/20 hover:text-neon-red text-white/30"
                      title="Delete session"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </button>
            ))}
            {sessionList.length === 0 && (
              <div className="p-3 text-xs text-white/20 italic">No sessions</div>
            )}
          </div>
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {!hasActiveSession && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-24">
                {gatewayOnline === false && (
                  <div className="w-full max-w-md mb-6 p-4 bg-neon-red/10 border border-neon-red/20 rounded-lg text-left">
                    <div className="flex items-center gap-2 text-neon-red mb-1">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-semibold">Gateway Offline</span>
                    </div>
                    <p className="text-xs text-white/60">
                      The Hermes Gateway (port 8642) is not responding.
                      Start it with: <code className="text-neon-cyan">hermes gateway start</code>
                    </p>
                  </div>
                )}
                {gatewayOnline !== false && agentDefaultModelSet === false && (
                  <div className="w-full max-w-md mb-6 p-4 bg-neon-orange/10 border border-neon-orange/20 rounded-lg text-left">
                    <div className="flex items-center gap-2 text-neon-orange mb-1">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-semibold">Model not ready for chat</span>
                    </div>
                    <p className="text-xs text-white/60">
                      Set an agent default under Config → Models, push to Hermes (or Operations →
                      Agents → Push Bob), or run <code className="text-neon-cyan">hermes model</code>.
                      The gateway reads <code className="text-white/50">~/.hermes/config.yaml</code>{" "}
                      model.default — the chat dropdown label alone does not change inference.
                    </p>
                  </div>
                )}
                {gatewayOnline === null && (
                  <div className="flex items-center gap-2 mb-4">
                    <Loader2 className="w-3 h-3 text-white/30 animate-spin" />
                    <span className="text-xs text-white/30">Checking gateway connection...</span>
                  </div>
                )}
                <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                  <MessageCircle className="w-8 h-8 text-white/30" />
                </div>
                <h3 className="text-lg font-semibold text-white/60 mb-1">
                  Chat with your agent
                </h3>
                <p className="text-sm text-white/40 mb-2 max-w-md">
                  Type a message below to start a new conversation.
                </p>
                {gatewayOnline !== false && (
                  <p className="text-xs text-white/20 font-mono">
                    Connected via Gateway API Server at localhost:8642
                  </p>
                )}
              </div>
            ) : messages.length === 0 && hasActiveSession ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-24">
                <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                  <MessageCircle className="w-8 h-8 text-white/30" />
                </div>
                <h3 className="text-lg font-semibold text-white/60 mb-1">
                  {sessions.find((s) => s.id === activeSessionId)?.title || "New Chat"}
                </h3>
                <p className="text-sm text-white/40 mb-2 max-w-md">
                  Send a message to begin.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-lg bg-neon-purple/20 border border-neon-purple/30 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-neon-purple" />
                    </div>
                  )}

                  <div
                    className={`max-w-[70%] rounded-xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-neon-cyan/10 border border-neon-cyan/20 text-white"
                        : "bg-white/5 border border-white/10 text-white/80"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div
                        className="text-sm leading-relaxed prose prose-invert max-w-none"
                        dangerouslySetInnerHTML={{
                          __html: msg.content
                            ? renderMarkdown(msg.content)
                            : '<span class="text-white/30 italic">Thinking...</span>',
                        }}
                      />
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    )}
                    <div className="text-[10px] text-white/20 font-mono mt-1 text-right">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>

                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-neon-cyan/20 border border-neon-cyan/30 flex items-center justify-center shrink-0 mt-1">
                      <User className="w-4 h-4 text-neon-cyan" />
                    </div>
                  )}
                </div>
              ))
            )}

            {isStreaming && messages.length > 0 && (
              <TypingIndicator />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area — always visible */}
          <div className="border-t border-white/10 px-6 py-4">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isStreaming
                    ? "Type to interrupt and send a new message..."
                    : hasActiveSession
                    ? "Type a message... (Enter to send, Shift+Enter for newline)"
                    : "Type a message to start a new conversation..."
                }
                rows={1}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-neon-cyan/50 transition-colors font-mono resize-none"
                style={{ minHeight: "42px", maxHeight: "120px" }}
                onInput={(e) => {
                  const ta = e.target as HTMLTextAreaElement;
                  ta.style.height = "auto";
                  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
                }}
              />
              <button
                onClick={isStreaming ? () => abortControllerRef.current?.abort() : handleSend}
                disabled={!input.trim() && !isStreaming}
                className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-colors ${
                  isStreaming
                    ? "bg-neon-red/20 border-neon-red/30 text-neon-red hover:bg-neon-red/30"
                    : "bg-neon-cyan/20 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/30 disabled:opacity-30 disabled:cursor-not-allowed"
                }`}
              >
                {isStreaming ? (
                  <Square className="w-4 h-4 fill-current" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
