import { describe, expect, it } from "vitest";
import { decidePromotion, validatePromotionCandidate, type PromotionCandidate } from "../index.js";

const candidate: PromotionCandidate = { id: "candidate-1", scope: "harness", summary: "Use review mode for diff-only work", evidenceIds: ["obs-1", "obs-2"], rollbackPath: "revert rule", verification: ["run tests"], changesPolicy: false, changesPermissions: false, changesSafety: false };

describe("optimization safety", () => {
  it("requires evidence, verification, rollback, and safe scope", () => {
    expect(validatePromotionCandidate(candidate)).toEqual(candidate);
    expect(decidePromotion(candidate, "accepted", "human", "reviewed evidence")).toEqual({ candidateId: "candidate-1", decision: "accepted", reviewer: "human", reason: "reviewed evidence" });
  });

  it("rejects unsafe or sensitive promotions", () => {
    expect(() => validatePromotionCandidate({ ...candidate, changesSafety: true })).toThrow("cannot weaken");
    expect(() => validatePromotionCandidate({ ...candidate, payload: "api_key: abcdefghijklmnop" })).toThrow("sensitive");
    expect(() => validatePromotionCandidate({ ...candidate, rollbackPath: "" })).toThrow("rollbackPath");
  });
});
