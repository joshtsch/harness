import { describe, expect, it, vi } from "vitest";
import { resolveIssue } from "../src/issue-tracker.js";

describe("resolveIssue", () => {
  it("resolves a GitHub issue without storing its body", async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: '{"number":11,"title":"Validate setup"}', stderr: "" });
    await expect(resolveIssue({ type: "github", repository: "joshtsch/harness" }, "11", run)).resolves.toEqual({
      key: "11", number: 11, title: "Validate setup", repository: "joshtsch/harness",
    });
    expect(run).toHaveBeenCalledWith("gh", ["issue", "view", "11", "--repo", "joshtsch/harness", "--json", "number,title"]);
  });

  it("fails closed for tracker failures and malformed responses", async () => {
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "issue not found" }))).rejects.toThrow("issue not found");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "offline" }))).rejects.toThrow("offline");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 0, stdout: "{}", stderr: "" }))).rejects.toThrow("incomplete issue data");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 0, stdout: '{"number":4.5,"title":"Issue"}', stderr: "" }))).rejects.toThrow("incomplete issue data");
    await expect(resolveIssue({ type: "github", repository: "org/repo" }, "4", vi.fn().mockResolvedValue({ code: 0, stdout: '{"number":5,"title":"Issue"}', stderr: "" }))).rejects.toThrow("incomplete issue data");
  });

  it("requires a supported, configured tracker", async () => {
    const run = vi.fn();
    await expect(resolveIssue({ type: "jira" }, "4", run)).rejects.toThrow("unsupported issue tracker type");
    await expect(resolveIssue({ type: "github" }, "4", run)).rejects.toThrow("repository is required");
    expect(run).not.toHaveBeenCalled();
  });
});
