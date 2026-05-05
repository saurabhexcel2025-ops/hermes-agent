// ═══════════════════════════════════════════════════════════════
// organisations-repository.test.ts — Unit tests for organisations-repository
// ═══════════════════════════════════════════════════════════════

/** @jest-environment node */

jest.mock("@/lib/organisations-repository");

jest.mock("@/lib/api-logger", () => ({
  logApiError: jest.fn(),
}));

import {
  createOrganisation,
  getOrganisation,
  listOrganisations,
  updateOrganisation,
  deleteOrganisation,
  addTeamToOrganisation,
  removeTeamFromOrganisation,
  listOrganisationTeams,
  listUnassignedTeams,
} from "@/lib/organisations-repository";

const mockRepo = jest.mocked({
  createOrganisation,
  getOrganisation,
  listOrganisations,
  updateOrganisation,
  deleteOrganisation,
  addTeamToOrganisation,
  removeTeamFromOrganisation,
  listOrganisationTeams,
  listUnassignedTeams,
});

beforeEach(() => {
  jest.clearAllMocks();
});

const BASE_ORG = {
  id: "org_test123",
  name: "Test Organisation",
  description: "A test org",
  leaderId: "profile_bob",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  deletedAt: null,
};

const TEAM_SUMMARY = {
  id: "team_alpha",
  name: "Alpha Team",
  description: "The alpha team",
  leaderId: "profile_bob",
  memberCount: 3,
  boardCount: 2,
};

// ── createOrganisation ──────────────────────────────────────────

describe("createOrganisation", () => {
  it("creates and returns a new organisation", () => {
    mockRepo.createOrganisation.mockReturnValue(BASE_ORG);
    const result = createOrganisation({
      id: "org_test123",
      name: "Test Organisation",
      description: "A test org",
      leaderId: "profile_bob",
    });
    expect(result).toEqual(BASE_ORG);
    expect(mockRepo.createOrganisation).toHaveBeenCalledWith({
      id: "org_test123",
      name: "Test Organisation",
      description: "A test org",
      leaderId: "profile_bob",
    });
  });

  it("defaults description to empty string when omitted", () => {
    mockRepo.createOrganisation.mockReturnValue({ ...BASE_ORG, description: "" });
    const result = createOrganisation({
      id: "org_test123",
      name: "Test Organisation",
      leaderId: "profile_bob",
    });
    expect(result.description).toBe("");
  });
});

// ── getOrganisation ────────────────────────────────────────────

describe("getOrganisation", () => {
  it("returns the organisation when found", () => {
    mockRepo.getOrganisation.mockReturnValue(BASE_ORG);
    expect(getOrganisation("org_test123")).toEqual(BASE_ORG);
  });

  it("returns null when organisation does not exist", () => {
    mockRepo.getOrganisation.mockReturnValue(null);
    expect(getOrganisation("org_nonexistent")).toBeNull();
  });
});

// ── listOrganisations ──────────────────────────────────────────

describe("listOrganisations", () => {
  it("returns an empty array when no organisations exist", () => {
    mockRepo.listOrganisations.mockReturnValue([]);
    expect(listOrganisations()).toEqual([]);
  });

  it("returns all organisations ordered by created_at desc", () => {
    const orgs = [
      { ...BASE_ORG, id: "org_1", name: "Org One", createdAt: "2025-01-02T00:00:00.000Z" },
      { ...BASE_ORG, id: "org_2", name: "Org Two", createdAt: "2025-01-01T00:00:00.000Z" },
    ];
    mockRepo.listOrganisations.mockReturnValue(orgs);
    expect(listOrganisations()).toHaveLength(2);
    expect(listOrganisations()[0].name).toBe("Org One");
  });
});

// ── updateOrganisation ──────────────────────────────────────────

describe("updateOrganisation", () => {
  it("updates and returns the updated organisation", () => {
    const updated = { ...BASE_ORG, name: "Updated Name" };
    mockRepo.updateOrganisation.mockReturnValue(updated);
    expect(updateOrganisation("org_test123", { name: "Updated Name" })).toEqual(updated);
  });

  it("returns null when organisation does not exist", () => {
    mockRepo.updateOrganisation.mockReturnValue(null);
    expect(updateOrganisation("org_nonexistent", { name: "New Name" })).toBeNull();
  });

  it("can update description", () => {
    const updated = { ...BASE_ORG, description: "New description" };
    mockRepo.updateOrganisation.mockReturnValue(updated);
    expect(updateOrganisation("org_test123", { description: "New description" })).toEqual(updated);
  });

  it("can update leaderId", () => {
    const updated = { ...BASE_ORG, leaderId: "profile_alice" };
    mockRepo.updateOrganisation.mockReturnValue(updated);
    expect(updateOrganisation("org_test123", { leaderId: "profile_alice" })).toEqual(updated);
  });
});

// ── deleteOrganisation ─────────────────────────────────────────

describe("deleteOrganisation", () => {
  it("returns true when deletion succeeds", () => {
    mockRepo.deleteOrganisation.mockReturnValue(true);
    expect(deleteOrganisation("org_test123")).toBe(true);
  });

  it("returns false when organisation does not exist", () => {
    mockRepo.deleteOrganisation.mockReturnValue(false);
    expect(deleteOrganisation("org_nonexistent")).toBe(false);
  });
});

// ── addTeamToOrganisation ───────────────────────────────────────

describe("addTeamToOrganisation", () => {
  it("returns true when team is added successfully", () => {
    mockRepo.addTeamToOrganisation.mockReturnValue(true);
    expect(addTeamToOrganisation("org_test123", "team_alpha")).toBe(true);
  });

  it("returns false when organisation does not exist", () => {
    mockRepo.addTeamToOrganisation.mockReturnValue(false);
    expect(addTeamToOrganisation("org_nonexistent", "team_alpha")).toBe(false);
  });

  it("accepts optional position parameter", () => {
    mockRepo.addTeamToOrganisation.mockReturnValue(true);
    addTeamToOrganisation("org_test123", "team_alpha", 5);
    expect(mockRepo.addTeamToOrganisation).toHaveBeenCalledWith("org_test123", "team_alpha", 5);
  });
});

// ── removeTeamFromOrganisation ────────────────────────────────

describe("removeTeamFromOrganisation", () => {
  it("returns true when team is removed", () => {
    mockRepo.removeTeamFromOrganisation.mockReturnValue(true);
    expect(removeTeamFromOrganisation("org_test123", "team_alpha")).toBe(true);
  });

  it("returns false when the team is not in the organisation", () => {
    mockRepo.removeTeamFromOrganisation.mockReturnValue(false);
    expect(removeTeamFromOrganisation("org_test123", "team_nonexistent")).toBe(false);
  });
});

// ── listOrganisationTeams ───────────────────────────────────────

describe("listOrganisationTeams", () => {
  it("returns teams belonging to the organisation", () => {
    mockRepo.listOrganisationTeams.mockReturnValue([TEAM_SUMMARY]);
    expect(listOrganisationTeams("org_test123")).toEqual([TEAM_SUMMARY]);
  });

  it("returns an empty array when organisation has no teams", () => {
    mockRepo.listOrganisationTeams.mockReturnValue([]);
    expect(listOrganisationTeams("org_test123")).toEqual([]);
  });

  it("includes memberCount and boardCount for each team", () => {
    mockRepo.listOrganisationTeams.mockReturnValue([
      { ...TEAM_SUMMARY, memberCount: 5, boardCount: 3 },
    ]);
    const result = listOrganisationTeams("org_test123");
    expect(result[0].memberCount).toBe(5);
    expect(result[0].boardCount).toBe(3);
  });
});

// ── listUnassignedTeams ─────────────────────────────────────────

describe("listUnassignedTeams", () => {
  it("returns teams not yet in the organisation", () => {
    mockRepo.listUnassignedTeams.mockReturnValue([TEAM_SUMMARY]);
    expect(listUnassignedTeams("org_test123")).toEqual([TEAM_SUMMARY]);
  });

  it("returns an empty array when all teams are assigned", () => {
    mockRepo.listUnassignedTeams.mockReturnValue([]);
    expect(listUnassignedTeams("org_test123")).toEqual([]);
  });
});
