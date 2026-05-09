// ═══════════════════════════════════════════════════════════════
// goal-session-repository.test.ts — Unit tests for GoalSessionRepository
// ═══════════════════════════════════════════════════════════════

/** @jest-environment node */

// Mock the repository under test — it uses SQLite via db.ts internally
jest.mock("@/lib/goal-session-repository");

// Silence console.error noise from deriveStatusFromColumn in kanban-adapter
jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
}));

import {
  listGoalSessions,
  listGoalSessionsByCard,
  getGoalSession,
  createGoalSession,
  updateGoalSession,
  updateGoalStep,
  deleteGoalSession,
  getActiveGoalSessionForCard,
} from "@/lib/goal-session-repository";

const mockRepo = jest.mocked({
  listGoalSessions,
  listGoalSessionsByCard,
  getGoalSession,
  createGoalSession,
  updateGoalSession,
  updateGoalStep,
  deleteGoalSession,
  getActiveGoalSessionForCard,
});

beforeEach(() => {
  jest.clearAllMocks();
});

const BASE_SESSION = {
  id: "gs_test123",
  boardId: "board_abc",
  cardId: "card_xyz",
  goalLoopMode: "sequential" as const,
  goals: ["Goal One", "Goal Two", "Goal Three"],
  currentGoalIndex: 0,
  steps: [
    { index: 0, goal: "Goal One", status: "pending" as const, missionId: null, assignedProfileId: "bob", completedAt: null, error: null },
    { index: 1, goal: "Goal Two", status: "pending" as const, missionId: null, assignedProfileId: null, completedAt: null, error: null },
    { index: 2, goal: "Goal Three", status: "pending" as const, missionId: null, assignedProfileId: null, completedAt: null, error: null },
  ],
  status: "active" as const,
  coordinatorMissionId: null,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("listGoalSessions", () => {
  it("returns an empty array when no sessions exist", () => {
    mockRepo.listGoalSessions.mockReturnValue([]);
    expect(listGoalSessions()).toEqual([]);
  });

  it("returns all sessions when no boardId filter is given", () => {
    mockRepo.listGoalSessions.mockReturnValue([BASE_SESSION]);
    expect(listGoalSessions()).toHaveLength(1);
    expect(listGoalSessions()[0].id).toBe("gs_test123");
  });

  it("filters sessions by boardId", () => {
    mockRepo.listGoalSessions.mockReturnValue([BASE_SESSION]);
    const result = listGoalSessions("board_abc");
    expect(result).toHaveLength(1);
    expect(result[0].boardId).toBe("board_abc");
  });

  it("returns empty array for a board with no sessions", () => {
    mockRepo.listGoalSessions.mockReturnValue([]);
    expect(listGoalSessions("board_no_sessions")).toEqual([]);
  });
});

describe("listGoalSessionsByCard", () => {
  it("returns sessions for a given card", () => {
    mockRepo.listGoalSessionsByCard.mockReturnValue([BASE_SESSION]);
    const result = listGoalSessionsByCard("card_xyz");
    expect(result).toHaveLength(1);
    expect(result[0].cardId).toBe("card_xyz");
  });

  it("returns empty array when no sessions exist for the card", () => {
    mockRepo.listGoalSessionsByCard.mockReturnValue([]);
    expect(listGoalSessionsByCard("card_nonexistent")).toEqual([]);
  });
});

describe("getGoalSession", () => {
  it("returns the session when it exists", () => {
    mockRepo.getGoalSession.mockReturnValue(BASE_SESSION);
    const result = getGoalSession("gs_test123");
    expect(result).toEqual(BASE_SESSION);
    expect(result!.id).toBe("gs_test123");
  });

  it("returns null for a non-existent session", () => {
    mockRepo.getGoalSession.mockReturnValue(null);
    expect(getGoalSession("gs_nonexistent")).toBeNull();
  });
});

describe("createGoalSession", () => {
  it("creates a session with all steps in pending state", () => {
    const created = { ...BASE_SESSION, id: "gs_new" };
    mockRepo.createGoalSession.mockReturnValue(created);
    const result = createGoalSession({
      boardId: "board_abc",
      cardId: "card_xyz",
      mode: "sequential",
      goals: ["Goal One", "Goal Two", "Goal Three"],
      assignedProfileId: "bob",
    });
    expect(result.id).toBe("gs_new");
    expect(result.status).toBe("active");
    expect(result.steps).toHaveLength(3);
    expect(result.steps.every((s) => s.status === "pending")).toBe(true);
  });

  it("creates a session in parallel mode", () => {
    const parallelSession = { ...BASE_SESSION, goalLoopMode: "parallel" as const, steps: BASE_SESSION.steps.map(s => ({ ...s, assignedProfileId: null })) };
    mockRepo.createGoalSession.mockReturnValue(parallelSession);
    const result = createGoalSession({
      boardId: "board_abc",
      cardId: "card_xyz",
      mode: "parallel",
      goals: ["Goal Alpha", "Goal Beta"],
    });
    expect(result.goalLoopMode).toBe("parallel");
  });
});

describe("updateGoalSession", () => {
  it("updates currentGoalIndex", () => {
    const updated = { ...BASE_SESSION, currentGoalIndex: 1 };
    mockRepo.updateGoalSession.mockReturnValue(updated);
    const result = updateGoalSession("gs_test123", { currentGoalIndex: 1 });
    expect(result!.currentGoalIndex).toBe(1);
  });

  it("updates session status to paused", () => {
    const updated = { ...BASE_SESSION, status: "paused" as const };
    mockRepo.updateGoalSession.mockReturnValue(updated);
    const result = updateGoalSession("gs_test123", { status: "paused" });
    expect(result!.status).toBe("paused");
  });

  it("returns null when session does not exist", () => {
    mockRepo.updateGoalSession.mockReturnValue(null);
    expect(updateGoalSession("gs_nonexistent", { status: "paused" })).toBeNull();
  });
});

describe("updateGoalStep", () => {
  it("marks a step as completed", () => {
    const updatedStep = { ...BASE_SESSION.steps[0], status: "done" as const, completedAt: "2025-01-01T00:01:00.000Z" };
    mockRepo.updateGoalStep.mockReturnValue(updatedStep);
    const result = updateGoalStep(0, "gs_test123", { status: "done", completedAt: "2025-01-01T00:01:00.000Z" });
    expect(result!.status).toBe("done");
    expect(result!.completedAt).toBe("2025-01-01T00:01:00.000Z");
  });

  it("marks a step as failed with error message", () => {
    const failedStep = { ...BASE_SESSION.steps[0], status: "failed" as const, error: "Agent timed out" };
    mockRepo.updateGoalStep.mockReturnValue(failedStep);
    const result = updateGoalStep(0, "gs_test123", { status: "failed", error: "Agent timed out" });
    expect(result!.status).toBe("failed");
    expect(result!.error).toBe("Agent timed out");
  });

  it("returns null when the step does not exist", () => {
    mockRepo.updateGoalStep.mockReturnValue(null);
    expect(updateGoalStep(99, "gs_test123", { status: "done" })).toBeNull();
  });
});

describe("deleteGoalSession", () => {
  it("returns true when the session was deleted", () => {
    mockRepo.deleteGoalSession.mockReturnValue(true);
    expect(deleteGoalSession("gs_test123")).toBe(true);
  });

  it("returns false when the session did not exist", () => {
    mockRepo.deleteGoalSession.mockReturnValue(false);
    expect(deleteGoalSession("gs_nonexistent")).toBe(false);
  });
});

describe("getActiveGoalSessionForCard", () => {
  it("returns the active session for a card", () => {
    mockRepo.getActiveGoalSessionForCard.mockReturnValue(BASE_SESSION);
    const result = getActiveGoalSessionForCard("card_xyz");
    expect(result).not.toBeNull();
    expect(result!.cardId).toBe("card_xyz");
    expect(result!.status).toBe("active");
  });

  it("returns null when no active session exists for the card", () => {
    mockRepo.getActiveGoalSessionForCard.mockReturnValue(null);
    expect(getActiveGoalSessionForCard("card_no_session")).toBeNull();
  });
});
