import { describe, expect, it } from "vitest";
import { commitGuardViolations, forbiddenStagedPath, harnessBranchIssue, parseCommitInvocation } from "../src/git-guard.js";

const clean = { harnessRepository: true, branch: "claude/1-change", stagedPaths: ["src/a.ts"], stagedDiff: "+const a = 1;\n", stagesChanges: false };

describe("git commit guard", () => {
  it("finds the repository a command commits in", () => {
    expect(parseCommitInvocation("git status", "/repo")).toBeUndefined();
    expect(parseCommitInvocation("git log --grep commit", "/repo")).toBeUndefined();
    expect(parseCommitInvocation("git commit -m 'msg'", "/repo")).toEqual({ directory: "/repo", stagesChanges: false });
    expect(parseCommitInvocation("git -C ../child commit -F msg.txt", "/repo/sub")).toEqual({ directory: "/repo/child", stagesChanges: false });
    expect(parseCommitInvocation("cd /work/tree && git commit -m 'x'", "/repo")?.directory).toBe("/work/tree");
    expect(parseCommitInvocation("git commit --amend --no-edit", "/repo")?.stagesChanges).toBe(false);
    expect(parseCommitInvocation('git -C "/path/with space" commit -m x', "/repo")?.directory).toBe("/path/with space");
    expect(parseCommitInvocation('git -c user.name="A B" commit -m x', "/repo")?.directory).toBe("/repo");
    expect(parseCommitInvocation("cd ../child; git commit -m x", "/repo/harness")?.directory).toBe("/repo/child");
    expect(parseCommitInvocation("FOO=1 git commit -m x 2>&1 | tail -1", "/repo")).toEqual({ directory: "/repo", stagesChanges: false });
    expect(parseCommitInvocation("git commit -F - <<'EOF'\nfix: add -a file.ts\n\ngit add x\nEOF\necho done", "/repo")).toEqual({ directory: "/repo", stagesChanges: false });
    expect(parseCommitInvocation("echo 'git commit' > note.txt", "/repo")).toBeUndefined();
  });

  it("flags commands that stage and commit in one step", () => {
    expect(parseCommitInvocation("git add -A && git commit -m 'x'", "/repo")?.stagesChanges).toBe(true);
    expect(parseCommitInvocation("git commit -am 'x'", "/repo")?.stagesChanges).toBe(true);
    expect(parseCommitInvocation("git commit --all -m 'x'", "/repo")?.stagesChanges).toBe(true);
    expect(parseCommitInvocation("git commit -m 'add -a flag'", "/repo")?.stagesChanges).toBe(false);
    expect(parseCommitInvocation("git commit -m x .env", "/repo")?.stagesChanges).toBe(true);
    expect(parseCommitInvocation("git commit -m x -- src/a.ts", "/repo")?.stagesChanges).toBe(true);
    expect(parseCommitInvocation("git commit -o -m x", "/repo")?.stagesChanges).toBe(true);
  });

  it("blocks local configuration and environment files but not the example", () => {
    expect(forbiddenStagedPath("projects.local.yml")).toBe(true);
    expect(forbiddenStagedPath("app/.env")).toBe(true);
    expect(forbiddenStagedPath(".env.local")).toBe(true);
    expect(forbiddenStagedPath(".env.example")).toBe(false);
    expect(forbiddenStagedPath("docs/env.md")).toBe(false);
  });

  it("reports each violation", () => {
    expect(commitGuardViolations(clean)).toEqual([]);
    expect(commitGuardViolations({ ...clean, branch: "main" })).toEqual(["commits on main are not allowed; create a feature branch"]);
    expect(commitGuardViolations({ ...clean, stagedPaths: [".env"] })).toEqual([".env must never be committed; unstage it"]);
    expect(commitGuardViolations({ ...clean, stagesChanges: true })[0]).toContain("separate command");
    expect(commitGuardViolations({ ...clean, stagedDiff: `+${["-----BEGIN OPENSSH", "PRIVATE KEY-----"].join(" ")}\n` })).toEqual(["likely private-key in the staged diff; inspect it locally and remove it"]);
  });

  it("requires issue-numbered provider branches in the harness repository", () => {
    expect(harnessBranchIssue("codex/153-backlog-select")).toBe(153);
    expect(harnessBranchIssue("claude/provisional-tracker-outage")).toBe("provisional");
    for (const branch of ["claude/sad-agnesi-8eee2f", "codex/issue-40-skill", "feature/1-x", "claude/1-Upper", "claude/1", "pr-42"]) expect(harnessBranchIssue(branch)).toBeUndefined();
    expect(commitGuardViolations({ ...clean, branch: "claude/sad-agnesi-8eee2f" })).toEqual(["harness branch claude/sad-agnesi-8eee2f must be named <claude|codex>/<issue-number>-<slug>; rename it with git branch -m"]);
    expect(commitGuardViolations({ ...clean, branch: "12-child-change", harnessRepository: false })).toEqual([]);
    expect(commitGuardViolations({ ...clean, branch: undefined })).toEqual([]);
  });
});
