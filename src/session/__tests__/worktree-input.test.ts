import { describe, expect, it } from "vitest";
import { parseWorktreeArgs } from "../worktree-input.js";

describe("worktree CLI arguments", () => {
  it("separates flags from the issue title", () => {
    expect(parseWorktreeArgs(["--branch", "feature/existing", "example", "13", "Track", "branch", "--base", "feature/base", "--refresh"])).toEqual({ projectName: "example", issueKey: "13", ticketTitle: "Track branch", refresh: true, branch: "feature/existing", base: "feature/base" });
  });
  it("rejects missing, duplicate, and unknown options", () => {
    for (const args of [["--branch"], ["example", "13"], ["--branch", "--refresh", "example", "13", "Title"], ["--base", "main", "--base", "other", "example", "13", "Title"], ["--yes", "example", "13", "Title"]]) expect(() => parseWorktreeArgs(args)).toThrow("Usage:");
  });
});
