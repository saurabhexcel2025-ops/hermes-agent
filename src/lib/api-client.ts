// ═══════════════════════════════════════════════════════════════
// API client — centralized HTTP layer for Control Hub
// ═══════════════════════════════════════════════════════════════

import { apiFetch } from "@/lib/api-fetch";

export interface ApiError {
  status: number;
  message: string;
  data?: unknown;
}

/**
 * GET a JSON endpoint and return the parsed { data } payload.
 * Throws ApiError on non-2xx so callers can use try/catch.
 *
 * @example
 *   const { data } = await apiGet<Session>("/api/sessions/" + sessionId);
 */
export async function apiGet<T = unknown>(path: string): Promise<{ data: T }> {
  const json = await apiFetch(path);
  if (!("data" in json)) {
    throw new Error("Unexpected response shape: missing 'data' field");
  }
  return json as { data: T };
}
