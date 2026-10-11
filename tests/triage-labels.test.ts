import { describe, expect, it } from "vitest";
import { countTaskListIssueReferences, resolveChildIssueCount, triageViolations } from "../src/triage-labels.js";

describe("triage labels", () => {
  it("counts unique issue references in fallback task lists", () => {
    expect(countTaskListIssueReferences("- [ ] #12 Do the work\n- [x] #13 Verify it\n- [ ] #12 Duplicate\n- [ ] #11 Parent\n- unrelated #14", 11)).toBe(2);
  });

  it("falls back to child task-list references when GitHub returns 404", async () => {
    await expect(resolveChildIssueCount(11, "- [ ] #12 Child", async () => {
      const error = new Error("GitHub API request failed") as Error & { stderr: string };
      error.stderr = "HTTP 404: Not Found";
      throw error;
    })).resolves.toBe(1);
  });

  it("preserves non-404 API failures", async () => {
    await expect(resolveChildIssueCount(11, "", async () => {
      const error = new Error("GitHub API request failed") as Error & { stderr: string };
      error.stderr = "HTTP 403: Forbidden";
      throw error;
    })).rejects.toThrow("Cannot query sub-issues for #11: HTTP 403: Forbidden");
  });

  it("allows an unreviewed issue in intake", () => {
    expect(triageViolations({ number: 1, title: "Unknown", labels: ["needs-triage"] })).toEqual([]);
  });

  it("requires a type for ready issues", () => {
    expect(triageViolations({ number: 1, title: "Ready", labels: ["ready-for-agent"] })).toContain("ready issue must have one issue-type label");
  });

  it("accepts a typed ready issue", () => {
    expect(triageViolations({ number: 1, title: "Ready", labels: ["enhancement", "ready-for-agent"] })).toEqual([]);
  });

  it("accepts an epic that is ready for planning and has a child issue", () => {
    expect(triageViolations({
      number: 1,
      title: "Epic",
      labels: ["enhancement", "epic", "ready-for-planning"],
      subIssueCount: 1,
    })).toEqual([]);
  });

  it("requires planning readiness to match an epic with child issues", () => {
    expect(triageViolations({
      number: 1,
      title: "Epic without children",
      labels: ["enhancement", "epic", "ready-for-planning"],
      subIssueCount: 0,
    })).toContain("ready epic must have at least one sub-issue");
    expect(triageViolations({
      number: 2,
      title: "Unmarked planning issue",
      labels: ["enhancement", "ready-for-planning"],
      subIssueCount: 1,
    })).toContain("ready-for-planning issue must have the epic label");
  });

  it("does not allow epics to be marked ready for agent implementation", () => {
    expect(triageViolations({
      number: 1,
      title: "Epic",
      labels: ["enhancement", "epic", "ready-for-agent"],
      subIssueCount: 1,
    })).toContain("epic cannot be ready-for-agent");
  });

  it("requires epics to use planning readiness instead of deliverable readiness", () => {
    expect(triageViolations({
      number: 1,
      title: "Epic",
      labels: ["enhancement", "epic", "ready-for-human"],
      subIssueCount: 1,
    })).toContain("epic must use ready-for-planning instead of a deliverable readiness label");
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
