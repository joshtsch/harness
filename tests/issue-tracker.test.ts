import { describe, expect, it, vi } from "vitest";
import { resolveIssue } from "../src/issue-tracker.js";

const gherkin = "Scenario: setup\nGiven a project\nWhen setup runs\nThen it passes";

describe("resolveIssue", () => {
  it("resolves a GitHub issue without storing its body", async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({ number: 11, title: "Validate setup", labels: [{ name: "enhancement" }, { name: "ready-for-agent" }], body: gherkin }), stderr: "" });
    await expect(resolveIssue({ type: "github", repository: "joshtsch/harness" }, "11", run)).resolves.toEqual({
      key: "11", number: 11, title: "Validate setup", repository: "joshtsch/harness",
    });
    expect(run).toHaveBeenCalledWith("gh", ["api", "repos/joshtsch/harness/issues/11"]);
  });

  it("rejects planning epics as implementation session issues", async () => {
    for (const label of ["epic", "ready-for-planning"]) {
      const run = vi.fn().mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({ number: 11, title: "Planning epic", labels: [{ name: label }] }),
        stderr: "",
      });
      await expect(resolveIssue({ type: "github", repository: "joshtsch/harness" }, "11", run))
        .rejects.toThrow("planning epic; start the session from a deliverable sub-issue");
    }
  });

  it("rejects issues without Gherkin acceptance criteria and asks the agent to offer them", async () => {
    for (const body of [undefined, "", "Acceptance: it works"]) {
      const run = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({ number: 11, title: "Vague", labels: [{ name: "ready-for-human" }], body }), stderr: "" });
      await expect(resolveIssue({ type: "github", repository: "joshtsch/harness" }, "11", run))
        .rejects.toThrow("issue 11 has no Gherkin acceptance criteria. Before starting, offer the user");
    }
  });

  it("rejects issues that fail triage label rules", async () => {
    for (const labels of [[], [{ name: "ready-for-agent" }], [{ name: "bug" }, { name: "needs-triage" }, { name: "ready-for-agent" }], [{ name: "needs-triage" }]]) {
      const run = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({ number: 11, title: "Untyped", labels, body: gherkin }), stderr: "" });
      await expect(resolveIssue({ type: "github", repository: "joshtsch/harness" }, "11", run))
        .rejects.toThrow(/issue 11 fails triage: .*docs\/agents\/triage-labels\.md/);
    }
  });

  it("requires new tasks to have a parent epic and exempts older standalone issues", async () => {
    const ready = { number: 11, title: "Task", labels: [{ name: "enhancement" }, { name: "ready-for-agent" }], body: gherkin };
    const resolve = (fields: object) => resolveIssue({ type: "github", repository: "joshtsch/harness" }, "11", vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({ ...ready, ...fields }), stderr: "" }));
    await expect(resolve({ created_at: "2026-11-14T00:00:00Z", parent_issue_url: null })).rejects.toThrow("has no parent epic; link it under an open epic");
    await expect(resolve({ created_at: "2026-11-14T00:00:00Z", parent_issue_url: "https://api.github.com/repos/joshtsch/harness/issues/60" })).resolves.toMatchObject({ number: 11 });
    await expect(resolve({ created_at: "2026-11-13T23:59:59Z", parent_issue_url: null })).resolves.toMatchObject({ number: 11 });
  });

  it("rejects tasks with open subtasks", async () => {
    const ready = { number: 11, title: "Task", labels: [{ name: "enhancement" }, { name: "ready-for-agent" }], body: gherkin };
    const resolve = (summary: object) => resolveIssue({ type: "github", repository: "joshtsch/harness" }, "11", vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({ ...ready, sub_issues_summary: summary }), stderr: "" }));
    await expect(resolve({ total: 2, completed: 1 })).rejects.toThrow("has open subtasks; start the session from one of them");
    await expect(resolve({ total: 2, completed: 2 })).resolves.toMatchObject({ number: 11 });
  });

  it("rejects pull requests and non-numeric keys", async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({ number: 11, title: "PR", labels: [], body: gherkin, pull_request: {} }), stderr: "" });
    await expect(resolveIssue({ type: "github", repository: "joshtsch/harness" }, "11", run)).rejects.toThrow("is a pull request");
    await expect(resolveIssue({ type: "github", repository: "joshtsch/harness" }, "../11", run)).rejects.toThrow("issue key must be a number");
  });

  it("fails closed for tracker failures and malformed responses", async () => {
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "issue not found" }))).rejects.toThrow("issue not found");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "offline" }))).rejects.toThrow("offline");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 0, stdout: "{}", stderr: "" }))).rejects.toThrow("incomplete issue data");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 0, stdout: '{"number":4.5,"title":"Issue"}', stderr: "" }))).rejects.toThrow("incomplete issue data");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 0, stdout: '{"number":5,"title":"Issue","labels":[]}', stderr: "" }))).rejects.toThrow("incomplete issue data");
  });

  it("requires a supported, configured tracker", async () => {
    const run = vi.fn();
    await expect(resolveIssue({ type: "jira" }, "4", run)).rejects.toThrow("unsupported issue tracker type");
    await expect(resolveIssue({ type: "github" }, "4", run)).rejects.toThrow("repository is required");
    expect(run).not.toHaveBeenCalled();
  });
});
