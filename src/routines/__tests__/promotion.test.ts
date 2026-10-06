import { describe, expect, it } from "vitest";
import { createImplementationHandoff, rankCandidates, type RankedCandidate } from "../index.js";

const candidate = (id: string, benefit: number): RankedCandidate => ({ id, scope: "harness", summary: id, evidenceIds: ["obs-1", "obs-2"], rollbackPath: "revert", verification: ["test"], changesPolicy: false, changesPermissions: false, changesSafety: false, expectedBenefit: benefit, confidence: 0.8, cost: 0.1, risk: 0.1, evidenceStrength: 0.9 });

describe("promotion handoffs", () => {
  it("ranks candidates by benefit, confidence, cost, risk, and evidence", () => {
    expect(rankCandidates([candidate("low", 0.2), candidate("high", 0.9)]).map(({ id }) => id)).toEqual(["high", "low"]);
  });

  it("creates a reviewable implementation handoff with machine metadata", () => {
    expect(createImplementationHandoff(candidate("change", 0.8), "accepted")).toEqual({
      executiveSummary: "change", topChanges: ["change"], supportingEvidence: ["obs-1", "obs-2"], validationGuidance: ["test"], metadata: { candidateId: "change", scope: "harness", status: "accepted" },
    });
  });
});
