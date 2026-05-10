/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */

/**
 * PR 7 — dispatchMission falls back to the registry's `agent` default
 * when the caller doesn't pin a model/provider.
 */

import { existsSync, rmSync } from "fs";

const spawnCalls: Array<{ cmd: string; args: readonly string[] }> = [];

jest.mock("child_process", () => ({
  spawn: jest.fn((cmd: string, args: readonly string[]) => {
    spawnCalls.push({ cmd, args });
    return { unref: jest.fn(), on: jest.fn() };
  }),
}));

jest.mock("@/lib/paths", () => {
  const actualOs = jest.requireActual("os") as typeof import("os");
  const actualFs = jest.requireActual("fs") as typeof import("fs");
  const actualPath = jest.requireActual("path") as typeof import("path");
  const root = actualFs.mkdtempSync(actualPath.join(actualOs.tmpdir(), "ch-disp-default-"));
  return {
    PATHS: { missions: actualPath.join(root, "missions") },
    CH_DATA_DIR: root,
    __TEST_TMP_ROOT__: root,
  };
});

jest.mock("@/lib/hermes-agent-runtime", () => ({
  getActiveHermesPaths: jest.fn(() => ({ profiles: "/tmp/hermes-test/profiles" })),
  getAgentLlmEndpoints: jest.fn(() => ({ gatewayBase: "http://localhost:8080" })),
}));

jest.mock("@/lib/llm", () => ({ callLLM: jest.fn() }));

jest.mock("@/lib/models-repository", () => {
  const getDefaultModel = jest.fn();
  return {
    getDefaultModel,
    __getDefaultModel: getDefaultModel,
    getModelWithKey: jest.fn(),
  };
});

afterAll(() => {
  const paths = require("@/lib/paths") as { __TEST_TMP_ROOT__?: string };
  const root = paths.__TEST_TMP_ROOT__;
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  spawnCalls.length = 0;
  const repo = require("@/lib/models-repository") as { __getDefaultModel: jest.Mock };
  repo.__getDefaultModel.mockReset();
});

describe("dispatchMission — registry default fallback", () => {
  it("uses registered agent default when caller omits modelId", async () => {
    const repo = require("@/lib/models-repository") as { __getDefaultModel: jest.Mock };
    repo.__getDefaultModel.mockReturnValue({
      id: "model-default",
      modelId: "anthropic/claude-opus-4",
      provider: "anthropic",
    });

    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const backend = new HermesAgentBackend();
    await backend.dispatchMission({ name: "no model", prompt: "do" });

    expect(repo.__getDefaultModel).toHaveBeenCalledWith("agent");
    const wrapper = spawnCalls[0].args[1];
    expect(wrapper).toContain("--model anthropic/claude-opus-4");
    expect(wrapper).toContain("--provider anthropic");
  });

  it("explicit modelId wins over the registered default", async () => {
    const repo = require("@/lib/models-repository") as { __getDefaultModel: jest.Mock };
    repo.__getDefaultModel.mockReturnValue({
      id: "model-default",
      modelId: "anthropic/claude-opus-4",
      provider: "anthropic",
    });

    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const backend = new HermesAgentBackend();
    await backend.dispatchMission({
      name: "explicit",
      prompt: "do",
      modelId: "openai/gpt-5.5-medium",
      provider: "openai",
    });

    const wrapper = spawnCalls[0].args[1];
    expect(wrapper).toContain("--model openai/gpt-5.5-medium");
    expect(wrapper).toContain("--provider openai");
    expect(wrapper).not.toContain("anthropic/claude-opus-4");
    // We don't even hit the lookup when the caller provided modelId.
    expect(repo.__getDefaultModel).not.toHaveBeenCalled();
  });

  it("omits --model/--provider when no default is registered", async () => {
    const repo = require("@/lib/models-repository") as { __getDefaultModel: jest.Mock };
    repo.__getDefaultModel.mockReturnValue(null);

    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const backend = new HermesAgentBackend();
    await backend.dispatchMission({ name: "no default", prompt: "do" });

    const wrapper = spawnCalls[0].args[1];
    expect(wrapper).not.toContain("--model");
    expect(wrapper).not.toContain("--provider");
    expect(wrapper).toContain("hermes chat");
  });

  it("merges registry provider with caller modelId when caller didn't provide a provider", async () => {
    const repo = require("@/lib/models-repository") as { __getDefaultModel: jest.Mock };
    repo.__getDefaultModel.mockReturnValue({
      id: "model-default",
      modelId: "anthropic/claude-opus-4",
      provider: "anthropic",
    });

    // modelId omitted → lookup applies; provider omitted → uses registry's.
    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const backend = new HermesAgentBackend();
    await backend.dispatchMission({
      name: "partial",
      prompt: "do",
    });

    const wrapper = spawnCalls[0].args[1];
    expect(wrapper).toContain("--model anthropic/claude-opus-4");
    expect(wrapper).toContain("--provider anthropic");
  });
});
