/**
 * @jest-environment jsdom
 */
// ═══════════════════════════════════════════════════════════════
// PR 6 — Models page rendering
// ═══════════════════════════════════════════════════════════════
// Covers:
//   - empty state when /api/models returns []
//   - populated state with model rows + default badges
//   - defaults grid renders one card per task type and reflects the
//     /api/models/defaults response

import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";

import ModelsPage from "@/app/config/models/page";
import { TASK_TYPES } from "@/lib/hermes-providers";

interface FetchResponseInit {
  body: unknown;
  status?: number;
}

interface MinimalResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

function jsonResponse({ body, status = 200 }: FetchResponseInit): MinimalResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function setFetch(map: Record<string, FetchResponseInit>) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const matched = map[url];
    if (!matched) throw new Error(`Unmatched fetch: ${url}`);
    return jsonResponse(matched) as unknown as Response;
  }) as typeof global.fetch;
}

describe("ModelsPage", () => {
  it("renders empty state when no models exist", async () => {
    setFetch({
      "/api/models": { body: { data: { models: [] } } },
      "/api/credentials": { body: { data: { credentials: [] } } },
      "/api/models/defaults": {
        body: {
          data: {
            defaults: TASK_TYPES.reduce<Record<string, null>>((acc, t) => {
              acc[t] = null;
              return acc;
            }, {}),
          },
        },
      },
    });

    render(<ModelsPage />);

    await waitFor(() =>
      expect(screen.getByText(/No models yet/i)).toBeInTheDocument()
    );

    expect(screen.getByText(/My Models/i)).toBeInTheDocument();
    expect(screen.getByText(/Default Models/i)).toBeInTheDocument();
  });

  it("renders one defaults card per task type", async () => {
    setFetch({
      "/api/models": { body: { data: { models: [] } } },
      "/api/credentials": { body: { data: { credentials: [] } } },
      "/api/models/defaults": {
        body: {
          data: {
            defaults: TASK_TYPES.reduce<Record<string, null>>((acc, t) => {
              acc[t] = null;
              return acc;
            }, {}),
          },
        },
      },
    });

    const { container } = render(<ModelsPage />);

    await waitFor(() =>
      expect(container.querySelectorAll("[data-task-slot]").length).toBe(
        TASK_TYPES.length
      )
    );

    for (const slot of TASK_TYPES) {
      expect(
        container.querySelector(`[data-task-slot=\"${slot}\"]`)
      ).toBeInTheDocument();
    }
  });

  it("renders rows + Default-For badges for populated models", async () => {
    const claude = {
      id: "model-claude",
      name: "Claude Sonnet 4",
      provider: "anthropic",
      modelId: "anthropic/claude-sonnet-4",
      baseUrl: null,
      contextLength: 200000,
      credentialsId: "cred-anthropic",
      defaults: TASK_TYPES.reduce<Record<string, string | null>>((acc, t) => {
        acc[t] = t === "agent" ? "model-claude" : null;
        return acc;
      }, {}),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    setFetch({
      "/api/models": { body: { data: { models: [claude] } } },
      "/api/credentials": {
        body: {
          data: {
            credentials: [
              {
                id: "cred-anthropic",
                label: "anthropic key",
                provider: "anthropic",
                keyHint: "sk-a...wxyz",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        },
      },
      "/api/models/defaults": {
        body: {
          data: {
            defaults: TASK_TYPES.reduce<Record<string, string | null>>(
              (acc, t) => {
                acc[t] = t === "agent" ? claude.id : null;
                return acc;
              },
              {}
            ),
          },
        },
      },
    });

    const { container } = render(<ModelsPage />);

    await waitFor(() =>
      // Name appears in hero panel (active default display) AND in the table row
      expect(screen.getAllByText("Claude Sonnet 4")).toHaveLength(2)
    );

    const row = container.querySelector(
      `[data-row-id="${claude.id}"]`
    ) as HTMLElement;
    expect(row).not.toBeNull();
    // Provider + modelId + context cells
    expect(within(row).getByText("anthropic")).toBeInTheDocument();
    expect(within(row).getByText("anthropic/claude-sonnet-4")).toBeInTheDocument();
    expect(within(row).getByText("200000")).toBeInTheDocument();
    // Default-For badge
    expect(within(row).getByText(/agent/i)).toBeInTheDocument();
  });
});
