import { describe, expect, it } from "vitest";
import { triageViolations } from "../src/triage-labels.js";

describe("triage labels", () => {
  it("allows an unreviewed issue in intake", () => {
    expect(triageViolations({ number: 1, title: "Unknown", labels: ["needs-triage"] })).toEqual([]);
  });

  it("requires a type for ready issues", () => {
    expect(triageViolations({ number: 1, title: "Ready", labels: ["ready-for-agent"] })).toContain("ready issue must have one issue-type label");
  });

  it("accepts a typed ready issue", () => {
    expect(triageViolations({ number: 1, title: "Ready", labels: ["enhancement", "ready-for-agent"] })).toEqual([]);
  });

  it("rejects contradictory or incomplete state", () => {
    expect(triageViolations({ number: 1, title: "Mixed", labels: ["needs-triage", "bug", "ready-for-human"] })).toEqual([
      "cannot be needs-triage and ready",
    ]);
    expect(triageViolations({ number: 1, title: "Unclassified", labels: [] })).toEqual([
      "has no issue-type or needs-triage label",
      "has no readiness label",
    ]);
  });
});
