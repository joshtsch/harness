import { describe, expect, it, vi } from "vitest";
import { createProjectWorktree, type CommandRunner, type WorktreeProject } from "../worktree.js";

const project: WorktreeProject = {
  name: "example-project",
  path: "/workspace/projects/example-project",
  defaultBranch: "main",
};

function runnerFor(results: Record<string, { code: number; stdout?: string; stderr?: string }>): CommandRunner {
  return vi.fn(async (command, args) => {
    const key = [command, ...args].join(" ");
    const result = results[key] ?? (args.includes("--get") || (args.includes("--verify") && args.at(-1) !== "refs/remotes/origin/main^{commit}") ? { code: 1 } : { code: 0, stdout: "", stderr: "" });
    return { code: result.code, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  });
}

describe("createProjectWorktree", () => {
  it("verifies main and creates a deterministic worktree", async () => {
    const run = runnerFor({
      "git -C /workspace/projects/example-project symbolic-ref --short HEAD": { code: 0, stdout: "main\n" },
      "git -C /workspace/projects/example-project status --porcelain --untracked-files=all": { code: 0 },
      "git -C /workspace/projects/example-project rev-parse main": { code: 0, stdout: "abc\n" },
      "git -C /workspace/projects/example-project rev-parse origin/main": { code: 0, stdout: "abc\n" },
      "git -C /workspace/projects/example-project worktree add -b issue-123-add-login /workspace/.worktrees/example-project/issue-123-add-login main": { code: 0 },
    });
    const mkdir = vi.fn().mockResolvedValue(undefined);

    await expect(createProjectWorktree(project, {
      worktreesDirectory: "/workspace/.worktrees",
      run,
      stat: vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" })),
      mkdir,
      issueKey: "issue-123",
      ticketTitle: "Add login",
    })).resolves.toEqual({
      action: "created",
      branch: "issue-123-add-login",
      name: "issue-123-add-login",
      path: "/workspace/.worktrees/example-project/issue-123-add-login",
      base: "origin/main",
    });
    expect(mkdir).toHaveBeenCalledWith("/workspace/.worktrees/example-project", { recursive: true });
    expect(run).toHaveBeenCalledWith("git", ["-C", project.path, "worktree", "add", "--no-track", "-b", "issue-123-add-login", "/workspace/.worktrees/example-project/issue-123-add-login", "origin/main"]);
    expect(run).not.toHaveBeenCalledWith("git", ["-C", project.path, "fetch", "origin", "main"]);
  });

  it("rejects a dirty or stale default branch before creating a worktree", async () => {
    const run = runnerFor({
      "git -C /workspace/projects/example-project symbolic-ref --short HEAD": { code: 0, stdout: "main\n" },
      "git -C /workspace/projects/example-project status --porcelain --untracked-files=all": { code: 0, stdout: " M README.md\n" },
    });

    await expect(createProjectWorktree(project, {
      worktreesDirectory: "/workspace/.worktrees",
      run,
      stat: vi.fn(),
      mkdir: vi.fn(),
      issueKey: "issue-123",
      ticketTitle: "Add login",
    })).rejects.toThrow("default branch main is not clean");
  });

  it("reuses the canonical worktree and requires an attempt for a collision", async () => {
    const run = runnerFor({
      "git -C /workspace/projects/example-project symbolic-ref --short HEAD": { code: 0, stdout: "main\n" },
      "git -C /workspace/projects/example-project status --porcelain --untracked-files=all": { code: 0 },
      "git -C /workspace/projects/example-project rev-parse main": { code: 0, stdout: "abc\n" },
      "git -C /workspace/projects/example-project rev-parse origin/main": { code: 0, stdout: "abc\n" },
      "git -C /workspace/.worktrees/example-project/issue-123-add-login rev-parse --show-toplevel": { code: 0, stdout: "/workspace/.worktrees/example-project/issue-123-add-login\n" },
      "git -C /workspace/.worktrees/example-project/issue-123-add-login symbolic-ref --short HEAD": { code: 0, stdout: "issue-123-add-login\n" },
      "git -C /workspace/projects/example-project rev-parse --path-format=absolute --git-common-dir": { code: 0, stdout: "/workspace/projects/example-project/.git\n" },
      "git -C /workspace/.worktrees/example-project/issue-123-add-login rev-parse --path-format=absolute --git-common-dir": { code: 0, stdout: "/workspace/projects/example-project/.git\n" },
    });
    const existingStat = vi.fn().mockResolvedValue({});

    await expect(createProjectWorktree(project, {
      worktreesDirectory: "/workspace/.worktrees", run, stat: existingStat, realpath: async (path) => path, mkdir: vi.fn(), issueKey: "issue-123", ticketTitle: "Add login",
    })).resolves.toMatchObject({ action: "existing", name: "issue-123-add-login" });

    const missingStat = vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    const attemptRun = runnerFor({
      "git -C /workspace/projects/example-project symbolic-ref --short HEAD": { code: 0, stdout: "main\n" },
      "git -C /workspace/projects/example-project status --porcelain --untracked-files=all": { code: 0 },
      "git -C /workspace/projects/example-project rev-parse main": { code: 0, stdout: "abc\n" },
      "git -C /workspace/projects/example-project rev-parse origin/main": { code: 0, stdout: "abc\n" },
      "git -C /workspace/projects/example-project worktree add -b issue-123-add-login-attempt-2 /workspace/.worktrees/example-project/issue-123-add-login-attempt-2 main": { code: 0 },
    });
    await expect(createProjectWorktree(project, {
      worktreesDirectory: "/workspace/.worktrees", run: attemptRun, stat: missingStat, mkdir: vi.fn().mockResolvedValue(undefined), issueKey: "issue-123", ticketTitle: "Add login", attempt: 2,
    })).resolves.toMatchObject({ action: "created", name: "issue-123-add-login-attempt-2" });
  });

  it("refreshes only when explicitly requested", async () => {
    const run = runnerFor({
      "git -C /workspace/projects/example-project fetch origin main": { code: 0 },
      "git -C /workspace/projects/example-project symbolic-ref --short HEAD": { code: 0, stdout: "main\n" },
      "git -C /workspace/projects/example-project status --porcelain --untracked-files=all": { code: 0, stdout: " M README.md\n" },
      "git -C /workspace/projects/example-project rev-parse main": { code: 0, stdout: "abc\n" },
      "git -C /workspace/projects/example-project rev-parse origin/main": { code: 0, stdout: "abc\n" },
    });

    const onRefresh = vi.fn().mockResolvedValue(undefined);
    await expect(createProjectWorktree(project, {
      worktreesDirectory: "/workspace/.worktrees", run, stat: vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" })), mkdir: vi.fn(), issueKey: "issue-123", ticketTitle: "Add login", refresh: true,
      onRefresh,
    })).rejects.toThrow("default branch main is not clean");
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith("git", ["-C", project.path, "fetch", "--prune", "origin"]);
  });

  it("reports missing remote refs without fetching", async () => {
    const run = runnerFor({
      "git -C /workspace/projects/example-project symbolic-ref --short HEAD": { code: 0, stdout: "main\n" },
      "git -C /workspace/projects/example-project status --porcelain --untracked-files=all": { code: 0 },
      "git -C /workspace/projects/example-project rev-parse main": { code: 0, stdout: "abc\n" },
      "git -C /workspace/projects/example-project rev-parse origin/main": { code: 128, stderr: "unknown revision" },
    });

    await expect(createProjectWorktree(project, {
      worktreesDirectory: "/workspace/.worktrees", run, stat: vi.fn(), mkdir: vi.fn(), issueKey: "issue-123", ticketTitle: "Add login",
    })).rejects.toThrow("remote ref origin/main is unavailable; refresh project clone first");
  });
});
