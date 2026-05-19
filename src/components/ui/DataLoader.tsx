// ═══════════════════════════════════════════════════════════════
// DataLoader — loading / error / data UI primitives
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback, useRef, useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// ── ErrorMessage ──────────────────────────────────────────────

interface ErrorMessageProps {
  error?: string | null;
  onRetry?: () => void;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <div className="flex justify-center mb-4">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
        <p className="text-white/40 font-mono text-sm mb-6">
          {error || "An unexpected error occurred. Please try again."}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-sm font-mono transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

// ── useAsync ──────────────────────────────────────────────────

interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseAsyncReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: () => void;
}

/**
 * Reactive async hook — runs `fn` whenever it is called or when
 * `deps` change.  The callback is re-created only when deps differ,
 * so changing e.g. `sessionId` in the parent automatically triggers
 * a re-fetch for the new ID.
 *
 * @param fn  Async function to execute.  Must be re-created when
 *            deps change (wrap with useCallback in the caller).
 * @param deps  Dependency array forwarded to useCallback inside.
 *
 * @example
 *   const session = useAsync(
 *     () => apiGet<Session>("/api/sessions/" + sessionId).then(r => r.data),
 *     [sessionId]
 *   );
 *   // session.data / session.loading / session.error
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList,
): UseAsyncReturn<T> {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  // Stable execute — re-created only when deps change
  const execute = useCallback(() => {
    const controller = new AbortController();
    setState(prev => ({ ...prev, loading: true, error: null }));

    fn()
      .then(data => {
        if (!controller.signal.aborted) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      });

    return () => controller.abort();
    // execute is stable between deps changes; it captures the latest fn via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Re-run when deps change (mount + re-fetch on param change)
  useEffect(() => {
    const cleanup = execute();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, execute };
}
