// ═══════════════════════════════════════════════════════════════
// llm.ts — Configurable LLM endpoint for Story Weaver and other
// agent-agnostic LLM calls made by Control Hub.
// ═══════════════════════════════════════════════════════════════

import { getAgentLlmEndpoints } from "./hermes-agent-runtime";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Thrown when the Hermes Gateway is unreachable.
 * Provides a user-facing message with actionable steps.
 */
export class GatewayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayUnavailableError";
  }
}

/**
 * Probe the gateway health endpoint. Throws GatewayUnavailableError
 * with a descriptive message if the gateway is not responding.
 */
async function probeGatewayHealth(): Promise<void> {
  const { gatewayBase } = getAgentLlmEndpoints();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(gatewayBase + "/health", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      throw new GatewayUnavailableError(
        "Hermes Gateway is not running. Story Weaver needs it for AI generation. " +
          "Please ensure Hermes is started with API_SERVER_ENABLED=true in the agent .env, " +
          "then restart the gateway."
      );
    }
  } catch (err) {
    if (err instanceof GatewayUnavailableError) throw err;
    // Network failure or AbortError — gateway is unreachable
    throw new GatewayUnavailableError(
      "Hermes Gateway is not running. Story Weaver needs it for AI generation. " +
        "Please ensure Hermes is started with API_SERVER_ENABLED=true in the agent .env, " +
        "then restart the gateway."
    );
  }
}

/**
 * Call the configured LLM endpoint with retry and timeout.
 * Performs a gateway health probe before attempting the call.
 */
export async function callLLM(
  messages: LLMMessage[],
  opts: LLMOptions = {}
): Promise<LLMResponse> {
  const {
    temperature = 0.8,
    maxTokens = 4096,
    model = "hermes",
  } = opts;

  const { apiUrl } = getAgentLlmEndpoints();

  // Check gateway availability before attempting the call
  await probeGatewayHealth();

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min

    try {
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (resp.status === 429) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 30_000 * attempt));
          continue;
        }
        throw new Error("Rate limit — please wait a minute and try again.");
      }

      if (!resp.ok) {
        throw new Error(`LLM API error: ${resp.status} ${resp.statusText}`);
      }

      const data = await resp.json();
      const content =
        data.choices?.[0]?.message?.content?.trim() ?? "";

      if (!content && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 5_000 * attempt));
        continue;
      }

      return {
        content,
        model: data.model ?? model,
        usage: data.usage,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === "AbortError") {
        // Retry on timeout — treat it like any other retryable error
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 3_000 * attempt));
          continue;
        }
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 3_000 * attempt));
      }
    }
  }

  throw lastError ?? new Error("LLM call failed after retries");
}
