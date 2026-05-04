// ═══════════════════════════════════════════════════════════════
// goal-session-repository.test.ts — Unit tests for GoalSessionRepository
// ═══════════════════════════════════════════════════════════════

/** @jest-environment node */

const mockWriteFileSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockUnlinkSync = jest.fn();

jest.mock("fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
}));

jest.mock("@/lib/hermes", () => ({
  PATHS: { missions: "/tmp/test-missions" },
}));

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
}));

import {
  createGoalSession,
  loadGoalSession,
  saveGoalSession,
  advanceGoalSession,
  listGoalSessions,
  listGoalSessionsByBoard,
  listGoalSessionsByCard,
  deleteGoalSession,
} from "@/lib/goal-session-repository";

function resetMocks() {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
  mockMkdirSync.mockReturnValue(undefined);
  mockWriteFileSync.mockReturnValue(undefined);
  mockReadFileSync.mockReturnValue(null);
  mockReaddirSync.mockReturnValue([]);
  mockUnlinkSync.mockReturnValue(undefined);
}

const BASE_SESSION = {
  id: "gs_test123",
  boardId: "board_abc",
  cardId: "card_xyz",
  goalLoopMode: "sequential" as const,
  goals: ["Goal One", "Goal Two", "Goal Three"],
  currentGoalIndex: 0,
  steps: [
    { index: 0, goal: "Goal One", status: "pending" as const, missionId: null, assignedProfileId: null, completedAt: null, error: null },
    { index: 1, goal: "Goal Two", status: "pending" as const, missionId: null, assignedProfileId: null, completedAt: null, error: null },
    { index: 2, goal: "Goal Three", status: "pending" as const, missionId: null, assignedProfileId: null, completedAt: null, error: null },
  ],
  status: "active" as const,
  coordinatorMissionId: null,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("createGoalSession", () => {
  it("creates a session with all steps in pending state", () => {
    resetMocks();
    const session = createGoalSession({
      boardId: "board_abc",
      cardId: "card_xyz",
      goalLoopMode: "sequential",
      goals: ["Goal One", "Goal Two", "Goal Three"],
      assignedProfileId: "bob",
    });

    expect(session.id).toMatch(/^gs_/);
    expect(session.boardId).toBe("board_abc");
    expect(session.cardId).toBe("card_xyz");
    expect(session.goalLoopMode).toBe("sequential");
    expect(session.goals).toEqual(["Goal One", "Goal Two", "Goal Three"]);
    expect(session.status).toBe("active");
    expect(session.steps).toHaveLength(3);
    expect(session.steps.every((s) => s.status === "pending")).toBe(true);
    expect(session.steps[0].assignedProfileId).toBe("bob"); // sequential gets assigned to first step
  });

  it("does not assign profileId in parallel mode", () => {
    resetMocks();
    const session = createGoalSession({
      boardId: "board_abc",
      cardId: "card_xyz",
      goalLoopMode: "parallel",
      goals: ["Goal One", "Goal Two"],
    });

    expect(session.steps[0].assignedProfileId).toBeNull();
    expect(session.goalLoopMode).toBe("parallel");
  });
});

describe("advanceGoalSession", () => {
  it("marks a step as completed and advances currentGoalIndex", () => {
    resetMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(BASE_SESSION));

    const result = advanceGoalSession("gs_test123", 0, "completed");

    expect(result).not.toBeNull();
    expect(result!.steps[0].status).toBe("done");
    expect(result!.steps[0].completedAt).not.toBeNull();
    expect(result!.currentGoalIndex).toBe(1); // advanced to next pending
    expect(result!.status).toBe("active");
  });

  it("marks the session as completed when all steps are done", () => {
    resetMocks();
    mockExistsSync.mockReturnValue(true);
    const session = {
      ...BASE_SESSION,
      steps: BASE_SESSION.steps.map((s) => ({ ...s, status: "done" as const })),
      currentGoalIndex: 3,
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(session));

    const result = advanceGoalSession("gs_test123", 2, "completed");

    expect(result!.status).toBe("completed");
  });

  it("marks session as failed when a step fails", () => {
    resetMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(BASE_SESSION));

    const result = advanceGoalSession("gs_test123", 0, "failed", null, "Sub-agent timed out");

    expect(result!.steps[0].status).toBe("failed");
    expect(result!.steps[0].error).toBe("Sub-agent timed out");
    expect(result!.status).toBe("failed");
  });

  it("pauses session when pause status is sent", () => {
    resetMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(BASE_SESSION));

    const result = advanceGoalSession("gs_test123", 0, "paused");

    expect(result!.status).toBe("paused");
  });

  it("returns null for non-existent session", () => {
    resetMocks();
    mockExistsSync.mockReturnValue(false);
    expect(advanceGoalSession("gs_nonexistent", 0, "completed")).toBeNull();
  });
});

describe("loadGoalSession", () => {
  it("returns null for non-existent session", () => {
    resetMocks();
    expect(loadGoalSession("gs_nonexistent")).toBeNull();
  });

  it("returns the parsed session", () => {
    resetMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(BASE_SESSION));

    const session = loadGoalSession("gs_test123");
    expect(session).toEqual(BASE_SESSION);
  });
});

describe("listGoalSessions", () => {
  it("returns empty array when no session files exist", () => {
    resetMocks();
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);

    expect(listGoalSessions()).toEqual([]);
  });

  it("filters sessions by boardId", () => {
    resetMocks();
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["gs_board1.goal.json", "gs_board2.goal.json"]);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes("board1")) {
        return JSON.stringify({ ...BASE_SESSION, boardId: "board1" });
      }
      return JSON.stringify({ ...BASE_SESSION, boardId: "board2" });
    });

    const filtered = listGoalSessionsByBoard("board1");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].boardId).toBe("board1");
  });

  it("filters sessions by cardId", () => {
    resetMocks();
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["gs_cardA.goal.json", "gs_cardB.goal.json"]);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes("cardA")) {
        return JSON.stringify({ ...BASE_SESSION, cardId: "cardA" });
      }
      return JSON.stringify({ ...BASE_SESSION, cardId: "cardB" });
    });

    const filtered = listGoalSessionsByCard("cardA");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].cardId).toBe("cardA");
  });
});

describe("deleteGoalSession", () => {
  it("deletes an existing session file", () => {
    resetMocks();
    mockExistsSync.mockImplementation((p: string) => p.includes("gs_test123"));
    const result = deleteGoalSession("gs_test123");
    expect(result).toBe(true);
    expect(mockUnlinkSync).toHaveBeenCalled();
  });

  it("returns false for non-existent session", () => {
    resetMocks();
    mockExistsSync.mockReturnValue(false);
    expect(deleteGoalSession("gs_nonexistent")).toBe(false);
  });
});

describe("saveGoalSession", () => {
  it("persists a session correctly to disk", () => {
    resetMocks();
    const session = {
      ...BASE_SESSION,
      id: "gs_test_persist",
      status: "active" as const,
    };
    saveGoalSession(session);
    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
    const writeCall = mockWriteFileSync.mock.calls[0];
    expect(writeCall[0]).toContain("gs_test_persist.goal.json");
    const written = JSON.parse(writeCall[1] as string);
    expect(written.id).toBe("gs_test_persist");
    expect(written.boardId).toBe("board_abc");
    expect(written.status).toBe("active");
  });

  it("updates an existing session", () => {
    resetMocks();
    const session = {
      ...BASE_SESSION,
      id: "gs_test123",
      status: "paused" as const,
      currentGoalIndex: 2,
    };
    saveGoalSession(session);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const writeCall = mockWriteFileSync.mock.calls[0];
    const written = JSON.parse(writeCall[1] as string);
    expect(written.status).toBe("paused");
    expect(written.currentGoalIndex).toBe(2);
  });

  it("does not write when session id is sanitized to empty", () => {
    resetMocks();
    // "!!!" becomes "" after sanitization (all non-alphanumeric chars stripped)
    const session = { ...BASE_SESSION, id: "!!!" } as unknown as typeof BASE_SESSION;
    saveGoalSession(session);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

describe("loadGoalSession — invalid IDs", () => {
  it("returns null for session with invalid characters in id", () => {
    resetMocks();
    expect(loadGoalSession("gs_../../../etc/passwd")).toBeNull();
    expect(loadGoalSession("")).toBeNull();
  });
});

describe("concurrent saves", () => {
  it("does not raise errors when multiple saves occur in sequence", () => {
    resetMocks();
    const session1 = { ...BASE_SESSION, id: "gs_concurrent_a" };
    const session2 = { ...BASE_SESSION, id: "gs_concurrent_b" };
    saveGoalSession(session1);
    saveGoalSession(session2);
    // Both writes should succeed without throwing
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
  });

  it("each concurrent save writes to a distinct file path", () => {
    resetMocks();
    const session1 = { ...BASE_SESSION, id: "gs_concurrent_a" };
    const session2 = { ...BASE_SESSION, id: "gs_concurrent_b" };
    saveGoalSession(session1);
    saveGoalSession(session2);
    const paths = mockWriteFileSync.mock.calls.map((c) => c[0]);
    expect(paths[0]).not.toEqual(paths[1]);
    expect(paths[0]).toContain("gs_concurrent_a");
    expect(paths[1]).toContain("gs_concurrent_b");
  });
});
