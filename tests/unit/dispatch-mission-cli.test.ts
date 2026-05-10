/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */

/**
 * Tests the new HermesAgentBackend.dispatchMission CLI invocation:
 *   hermes [--profile X] chat -q "$CH_MISSION_PROMPT" [--model M]
 *          [--provider P] --quiet --source control-hub-mission --pass-session-id
 *
 * Verified against the canonical CLI surface in the Hermes agent repo
 * (hermes_cli/main.py argparse declarations).
 */

import { writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { buildHermesChatArgv } from "@/lib/backends/hermes";

// Capture spawn calls without actually starting subprocesses.
const spawnCalls: Array<{ cmd: string; args: readonly string[]; opts: Record<string, unknown> }> = [];

jest.mock("child_process", () => ({
  spawn: jest.fn((cmd: string, args: readonly string[], opts: Record<string, unknown>) => {
    spawnCalls.push({ cmd, args, opts });
    return { unref: jest.fn(), on: jest.fn() };
  }),
}));

jest.mock("@/lib/paths", () => {
  const actualOs = jest.requireActual("os") as typeof import("os");
  const actualFs = jest.requireActual("fs") as typeof import("fs");
  const actualPath = jest.requireActual("path") as typeof import("path");
  const root = actualFs.mkdtempSync(actualPath.join(actualOs.tmpdir(), "ch-dispatch-"));
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

jest.mock("@/lib/llm", () => ({
  callLLM: jest.fn(),
}));

afterAll(() => {
  const paths = require("@/lib/paths") as { __TEST_TMP_ROOT__?: string };
  const root = paths.__TEST_TMP_ROOT__;
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  spawnCalls.length = 0;
});

describe("buildHermesChatArgv", () => {
  it("includes only required flags when no model/provider/profile", () => {
    const argv = buildHermesChatArgv({ source: "control-hub-mission" });
    expect(argv).toEqual([
      "chat",
      "--quiet",
      "--source",
      "control-hub-mission",
      "--pass-session-id",
    ]);
  });

  it("places --profile before chat subcommand (Hermes pre-parse flag)", () => {
    const argv = buildHermesChatArgv({
      profileName: "engineering",
      source: "control-hub-mission",
    });
    expect(argv[0]).toBe("--profile");
    expect(argv[1]).toBe("engineering");
    expect(argv[2]).toBe("chat");
  });

  it("appends --model and --provider after chat subcommand", () => {
    const argv = buildHermesChatArgv({
      profileName: "qa",
      modelId: "anthropic/claude-sonnet-4",
      provider: "anthropic",
      source: "control-hub-mission",
    });
    expect(argv).toEqual([
      "--profile",
      "qa",
      "chat",
      "--model",
      "anthropic/claude-sonnet-4",
      "--provider",
      "anthropic",
      "--quiet",
      "--source",
      "control-hub-mission",
      "--pass-session-id",
    ]);
  });

  it("omits --model when modelId is empty/blank", () => {
    const argv = buildHermesChatArgv({ modelId: "   ", source: "control-hub-mission" });
    expect(argv).not.toContain("--model");
  });

  it("omits --provider when provider is empty/blank", () => {
    const argv = buildHermesChatArgv({ provider: "", source: "control-hub-mission" });
    expect(argv).not.toContain("--provider");
  });
});

describe("HermesAgentBackend.dispatchMission spawn", () => {
  it("spawns bash with -c wrapper and CH_MISSION_PROMPT env", async () => {
    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const backend = new HermesAgentBackend();

    const mission = await backend.dispatchMission({
      name: "Test mission",
      prompt: "do the thing",
      profileName: "engineering",
      modelId: "anthropic/claude-sonnet-4",
      provider: "anthropic",
    });

    expect(spawnCalls).toHaveLength(1);
    const call = spawnCalls[0];
    expect(call.cmd).toBe("bash");
    expect(call.args[0]).toBe("-c");
    const wrapper = call.args[1];
    expect(wrapper).toContain("hermes");
    expect(wrapper).toContain("--profile engineering");
    expect(wrapper).toContain("chat");
    expect(wrapper).toContain("--model anthropic/claude-sonnet-4");
    expect(wrapper).toContain("--provider anthropic");
    expect(wrapper).toContain("--quiet");
    expect(wrapper).toContain("--source control-hub-mission");
    expect(wrapper).toContain("--pass-session-id");
    expect(wrapper).toContain('-q "$CH_MISSION_PROMPT"');
    expect(wrapper).toContain(".status.json");
    expect(wrapper).toContain(`"successful"`);
    expect(wrapper).toContain(`"failed"`);

    const env = (call.opts.env as Record<string, string>) ?? {};
    expect(env.CH_MISSION_PROMPT).toBe("do the thing");
    expect(env.CH_MISSION_ID).toBe(mission.id);
    expect(call.opts.detached).toBe(true);
    expect(call.opts.stdio).toBe("ignore");
  });

  it("dispatches without --model/--provider when not supplied", async () => {
    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const backend = new HermesAgentBackend();

    await backend.dispatchMission({
      name: "Bare mission",
      prompt: "go",
    });

    expect(spawnCalls).toHaveLength(1);
    const wrapper = spawnCalls[0].args[1];
    expect(wrapper).not.toContain("--model");
    expect(wrapper).not.toContain("--provider");
    expect(wrapper).toContain("hermes chat");
  });

  it("returns a mission record with status='dispatched'", async () => {
    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const backend = new HermesAgentBackend();

    const mission = await backend.dispatchMission({
      name: "Mission record check",
      prompt: "task",
    });

    expect(mission.status).toBe("dispatched");
    expect(mission.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mission.name).toBe("Mission record check");
  });
});

describe("HermesAgentBackend.getMissionStatus reads callback file", () => {
  it("returns 'successful' when status.json reports successful", async () => {
    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const { PATHS } = require("@/lib/paths") as { PATHS: { missions: string } };
    const backend = new HermesAgentBackend();

    require("fs").mkdirSync(PATHS.missions, { recursive: true });
    const id = "11111111-1111-1111-1111-111111111111";
    writeFileSync(
      join(PATHS.missions, `${id}.status.json`),
      JSON.stringify({ status: "successful", exit_code: 0 })
    );

    expect(await backend.getMissionStatus(id)).toBe("successful");
  });

  it("returns 'failed' when status.json reports failed", async () => {
    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const { PATHS } = require("@/lib/paths") as { PATHS: { missions: string } };
    const backend = new HermesAgentBackend();

    const id = "22222222-2222-2222-2222-222222222222";
    writeFileSync(
      join(PATHS.missions, `${id}.status.json`),
      JSON.stringify({ status: "failed", exit_code: 1, error: "hermes chat exited 1" })
    );

    expect(await backend.getMissionStatus(id)).toBe("failed");
  });

  it("returns 'dispatched' when only mission record exists (no callback yet)", async () => {
    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const { PATHS } = require("@/lib/paths") as { PATHS: { missions: string } };
    const backend = new HermesAgentBackend();

    const id = "33333333-3333-3333-3333-333333333333";
    writeFileSync(
      join(PATHS.missions, `${id}.json`),
      JSON.stringify({ id, status: "dispatched" })
    );

    expect(await backend.getMissionStatus(id)).toBe("dispatched");
  });

  it("returns 'queued' when nothing on disk", async () => {
    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const backend = new HermesAgentBackend();

    expect(await backend.getMissionStatus("nonexistent-id")).toBe("queued");
  });

  it("ignores invalid status values in callback file", async () => {
    const { HermesAgentBackend } = require("@/lib/backends/hermes") as typeof import("@/lib/backends/hermes");
    const { PATHS } = require("@/lib/paths") as { PATHS: { missions: string } };
    const backend = new HermesAgentBackend();

    const id = "44444444-4444-4444-4444-444444444444";
    writeFileSync(
      join(PATHS.missions, `${id}.status.json`),
      JSON.stringify({ status: "garbage" })
    );

    // Falls through to "queued" since no mission record either.
    expect(await backend.getMissionStatus(id)).toBe("queued");
  });
});
