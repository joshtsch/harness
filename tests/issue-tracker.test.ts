import { describe, expect, it, vi } from "vitest";
import { issueStartViolations, pullRequestIssueViolations, resolveIssue } from "../src/issue-tracker.js";

describe("resolveIssue", () => {
  it("resolves a GitHub issue without storing its body", async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: '{"number":11,"title":"Validate setup","state":"OPEN","labels":[{"name":"ready-for-agent"}]}', stderr: "" });
    await expect(resolveIssue({ type: "github", repository: "joshtsch/harness" }, "11", run)).resolves.toEqual({
      key: "11", number: 11, title: "Validate setup", repository: "joshtsch/harness",
    });
    expect(run).toHaveBeenCalledWith("gh", ["issue", "view", "11", "--repo", "joshtsch/harness", "--json", "number,title,state,labels"]);
  });

  it("rejects planning epics as implementation session issues", async () => {
    for (const label of ["epic", "ready-for-planning"]) {
      const run = vi.fn().mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({ number: 11, title: "Planning epic", state: "OPEN", labels: [{ name: label }] }),
        stderr: "",
      });
      await expect(resolveIssue({ type: "github", repository: "joshtsch/harness" }, "11", run))
        .rejects.toThrow("planning epic; start the session from a deliverable sub-issue");
    }
  });

  it("fails closed for tracker failures and malformed responses", async () => {
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "issue not found" }))).rejects.toThrow("issue not found");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "offline" }))).rejects.toThrow("offline");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 0, stdout: "{}", stderr: "" }))).rejects.toThrow("incomplete issue data");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 0, stdout: '{"number":4,"title":"Issue","labels":[]}', stderr: "" }))).rejects.toThrow("incomplete issue data");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 0, stdout: '{"number":4.5,"title":"Issue"}', stderr: "" }))).rejects.toThrow("incomplete issue data");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 0, stdout: '{"number":5,"title":"Issue","state":"OPEN","labels":[]}', stderr: "" }))).rejects.toThrow("incomplete issue data");
  });

  it("requires a supported, configured tracker", async () => {
    const run = vi.fn();
    await expect(resolveIssue({ type: "jira" }, "4", run)).rejects.toThrow("unsupported issue tracker type");
    await expect(resolveIssue({ type: "github" }, "4", run)).rejects.toThrow("repository is required");
    expect(run).not.toHaveBeenCalled();
  });

  it("starts work only from an open, triaged deliverable issue", () => {
    const ready = { key: "7", state: "OPEN", labels: ["enhancement", "ready-for-human"] };
    expect(issueStartViolations(ready)).toEqual([]);
    expect(issueStartViolations({ ...ready, state: "CLOSED" })).toEqual(["issue 7 is closed; start from an open issue"]);
    expect(issueStartViolations({ ...ready, labels: ["epic", "ready-for-planning"] })[0]).toContain("planning epic");
    expect(issueStartViolations({ ...ready, labels: ["needs-triage"] })[0]).toContain("is needs-triage");
    expect(issueStartViolations({ ...ready, labels: ["enhancement"] })[0]).toContain("no ready-for-agent or ready-for-human label");
  });

  it("checks a pull request's branch, issue, and body", () => {
    const pr = { branch: "claude/7-x", issueNumber: 7, body: "Closes #7.", issueState: "OPEN" } as const;
    expect(pullRequestIssueViolations(pr)).toEqual([]);
    expect(pullRequestIssueViolations({ ...pr, body: "See https://github.com/o/r/issues/7" })).toEqual([]);
    expect(pullRequestIssueViolations({ ...pr, body: "Closes #70 and a#7" })).toEqual(["pull request body must reference #7"]);
    expect(pullRequestIssueViolations({ ...pr, issueState: "CLOSED" })).toEqual(["issue #7 is not an open issue"]);
    expect(pullRequestIssueViolations({ ...pr, issueState: undefined })).toEqual(["issue #7 is not an open issue"]);
    expect(pullRequestIssueViolations({ ...pr, issueNumber: undefined })[0]).toContain("must be named");
    expect(pullRequestIssueViolations({ ...pr, issueNumber: "provisional" })[0]).toContain("is provisional");
  });
});
