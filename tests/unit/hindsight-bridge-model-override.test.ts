/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */

/**
 * PR 7 — Hindsight bridge picks up the registry's `hindsight` default
 * by injecting HINDSIGHT_LLM_* env vars on the spawned subprocess.
 */

jest.mock("next/server", () => ({
  NextRequest: class NextRequest {
    url: string;
    nextUrl: URL;
    headers: Headers;
    constructor(url: string) {
      this.url = url;
      this.nextUrl = new URL(url);
      this.headers = new Headers();
    }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => {
      const status = init?.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
      };
    },
  },
}));

const execCalls: Array<{ cmd: string; opts: { env?: Record<string, string> } }> = [];

jest.mock("child_process", () => ({
  exec: jest.fn(
    (
      cmd: string,
      opts: { env?: Record<string, string> },
      cb: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      execCalls.push({ cmd, opts });
      // Pretend the bridge returned an empty list.
      cb(null, JSON.stringify({ memories: [] }), "");
    }
  ),
}));

jest.mock("fs", () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
}));

jest.mock("@/lib/hermes-agent-runtime", () => ({
  getActiveHermesHome: jest.fn(() => "/tmp/hermes-home"),
}));

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
}));

jest.mock("@/lib/models-repository", () => {
  const getDefaultModel = jest.fn();
  const getModelWithKey = jest.fn();
  return {
    getDefaultModel,
    getModelWithKey,
    __getDefaultModel: getDefaultModel,
    __getModelWithKey: getModelWithKey,
  };
});

beforeEach(() => {
  execCalls.length = 0;
  const repo = require("@/lib/models-repository") as {
    __getDefaultModel: jest.Mock;
    __getModelWithKey: jest.Mock;
  };
  repo.__getDefaultModel.mockReset();
  repo.__getModelWithKey.mockReset();
});

describe("Hindsight bridge model override", () => {
  it("injects HINDSIGHT_LLM_MODEL/_BASE_URL/_API_KEY when default exists", async () => {
    const repo = require("@/lib/models-repository") as {
      __getDefaultModel: jest.Mock;
      __getModelWithKey: jest.Mock;
    };
    repo.__getDefaultModel.mockReturnValue({
      id: "m-hindsight",
      modelId: "anthropic/claude-sonnet-4",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
    });
    repo.__getModelWithKey.mockReturnValue({
      id: "m-hindsight",
      modelId: "anthropic/claude-sonnet-4",
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "sk-hindsight",
    });

    const { GET } = require("@/app/api/memory/hindsight/route") as typeof import("@/app/api/memory/hindsight/route");
    const { NextRequest } = require("next/server") as typeof import("next/server");
    const url = "http://localhost/api/memory/hindsight?action=recall&query=foo";
    const req = new NextRequest(url);
    await GET(req);

    expect(execCalls).toHaveLength(1);
    const env = execCalls[0].opts.env ?? {};
    expect(env.HINDSIGHT_LLM_MODEL).toBe("anthropic/claude-sonnet-4");
    expect(env.HINDSIGHT_LLM_BASE_URL).toBe("https://api.anthropic.com/v1");
    expect(env.HINDSIGHT_LLM_API_KEY).toBe("sk-hindsight");
  });

  it("does not inject HINDSIGHT_LLM_* when no default is registered", async () => {
    const repo = require("@/lib/models-repository") as {
      __getDefaultModel: jest.Mock;
    };
    repo.__getDefaultModel.mockReturnValue(null);

    const { GET } = require("@/app/api/memory/hindsight/route") as typeof import("@/app/api/memory/hindsight/route");
    const { NextRequest } = require("next/server") as typeof import("next/server");
    const url = "http://localhost/api/memory/hindsight?action=recall&query=foo";
    const req = new NextRequest(url);
    await GET(req);

    expect(execCalls).toHaveLength(1);
    const env = execCalls[0].opts.env ?? {};
    expect(env.HINDSIGHT_LLM_MODEL).toBeUndefined();
    expect(env.HINDSIGHT_LLM_BASE_URL).toBeUndefined();
    expect(env.HINDSIGHT_LLM_API_KEY).toBeUndefined();
  });

  it("omits HINDSIGHT_LLM_BASE_URL when registry row has no baseUrl", async () => {
    const repo = require("@/lib/models-repository") as {
      __getDefaultModel: jest.Mock;
      __getModelWithKey: jest.Mock;
    };
    repo.__getDefaultModel.mockReturnValue({
      id: "m-h",
      modelId: "anthropic/claude-sonnet-4",
      provider: "anthropic",
      baseUrl: null,
    });
    repo.__getModelWithKey.mockReturnValue({
      id: "m-h",
      modelId: "anthropic/claude-sonnet-4",
      provider: "anthropic",
      baseUrl: null,
      apiKey: "sk-only",
    });

    const { GET } = require("@/app/api/memory/hindsight/route") as typeof import("@/app/api/memory/hindsight/route");
    const { NextRequest } = require("next/server") as typeof import("next/server");
    const url = "http://localhost/api/memory/hindsight?action=recall&query=foo";
    const req = new NextRequest(url);
    await GET(req);

    const env = execCalls[0].opts.env ?? {};
    expect(env.HINDSIGHT_LLM_MODEL).toBe("anthropic/claude-sonnet-4");
    expect(env.HINDSIGHT_LLM_API_KEY).toBe("sk-only");
    expect(env.HINDSIGHT_LLM_BASE_URL).toBeUndefined();
  });
});
