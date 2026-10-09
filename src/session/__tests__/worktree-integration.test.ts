import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectWorktree, readWorktreeBase, type CommandRunner, type WorktreeProject } from "../worktree.js";

const exec = promisify(execFile);
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@localhost", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@localhost" };
const run: CommandRunner = async (command, args) => {
  try {
    return { code: 0, ...await exec(command, args, { env }) };
  } catch (error: any) {
    return { code: typeof error.code === "number" ? error.code : 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
};
async function git(...args: string[]): Promise<string> {
  const result = await run("git", args);
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

describe("worktree branches and bases with real Git", () => {
  let root: string;
  let seed: string;
  let project: WorktreeProject;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "harness-worktree-test-"));
    seed = join(root, "seed");
    const remote = join(root, "origin.git");
    await git("init", "--bare", "--initial-branch=main", remote);
    await git("init", "--initial-branch=main", seed);
    await mkdir(join(seed, "scripts"));
    await writeFile(join(seed, "scripts/setup.sh"), "#!/bin/sh\nexit 0\n");
    await git("-C", seed, "add", ".");
    await git("-C", seed, "commit", "-m", "Fixture");
    await git("-C", seed, "remote", "add", "origin", remote);
    await git("-C", seed, "push", "origin", "main");
    await git("-C", seed, "switch", "-c", "feature/existing");
    await writeFile(join(seed, "existing"), "remote feature commit");
    await git("-C", seed, "add", ".");
    await git("-C", seed, "commit", "-m", "Existing feature");
    await git("-C", seed, "switch", "-c", "feature/base", "main");
    await writeFile(join(seed, "base"), "stacked base commit");
    await git("-C", seed, "add", ".");
    await git("-C", seed, "commit", "-m", "Stacked base");
    await git("-C", seed, "switch", "main");
    await git("-C", seed, "push", "origin", "feature/existing", "feature/base");
    project = { name: "example-project", path: join(root, "projects", "example-project"), defaultBranch: "main" };
    await git("clone", remote, project.path);
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  const options = () => ({ worktreesDirectory: join(root, "worktrees"), issueKey: "13", ticketTitle: "Track branches", run });

  it("tracks an existing remote branch and reads its configured stacked base", async () => {
    const result = await createProjectWorktree(project, { ...options(), branch: "feature/existing", base: "feature/base" });
    expect(await git("-C", result.path, "rev-parse", "--abbrev-ref", "@{upstream}")).toBe("origin/feature/existing");
    expect(await readWorktreeBase(project.path, result.branch, run)).toBe("origin/feature/base");
    expect(await git("-C", result.path, "rev-parse", "HEAD")).toBe(await git("-C", seed, "rev-parse", "feature/existing"));
    expect(await createProjectWorktree(project, { ...options(), branch: "feature/existing" })).toMatchObject({ action: "existing", base: "origin/feature/base" });
  });

  it("detects deletion of the recorded remote base after fetch with prune", async () => {
    await createProjectWorktree(project, { ...options(), branch: "feature/existing", base: "feature/base" });
    await git("-C", seed, "push", "origin", "--delete", "feature/base");
    await expect(createProjectWorktree(project, { ...options(), branch: "feature/existing", refresh: true })).rejects.toThrow("recorded base origin/feature/base is unavailable");
    expect(await git("-C", project.path, "config", "--get", "branch.feature/existing.harness-base")).toBe("origin/feature/base");
  });

  it("creates a new branch from the requested base and refuses to overwrite it on reuse", async () => {
    const result = await createProjectWorktree(project, { ...options(), base: "origin/feature/base" });
    expect(result).toMatchObject({ action: "created", branch: "13-track-branches", base: "origin/feature/base" });
    expect(await git("-C", result.path, "rev-parse", "HEAD")).toBe(await git("-C", project.path, "rev-parse", "origin/feature/base"));
    await expect(createProjectWorktree(project, { ...options(), base: "main" })).rejects.toThrow("conflicts with recorded base");
  });

  it("attaches an existing local branch without resetting its commits", async () => {
    await git("-C", project.path, "switch", "-c", "feature/local", "main");
    await writeFile(join(project.path, "local"), "local commit");
    await git("-C", project.path, "add", ".");
    await git("-C", project.path, "commit", "-m", "Local feature");
    const head = await git("-C", project.path, "rev-parse", "HEAD");
    await git("-C", project.path, "switch", "main");
    const result = await createProjectWorktree(project, { ...options(), branch: "feature/local" });
    expect(await git("-C", result.path, "symbolic-ref", "--short", "HEAD")).toBe("feature/local");
    expect(await git("-C", result.path, "rev-parse", "HEAD")).toBe(head);
    expect(await readWorktreeBase(project.path, result.branch, run)).toBe("origin/main");
  });

  it("refuses a different branch or unrelated repository at the existing path", async () => {
    const result = await createProjectWorktree(project, options());
    await expect(createProjectWorktree(project, { ...options(), branch: "feature/existing" })).rejects.toThrow("not the requested worktree");
    await git("-C", project.path, "worktree", "remove", result.path);
    await git("init", "--initial-branch=13-track-branches", result.path);
    await writeFile(join(result.path, "fixture"), "unrelated");
    await git("-C", result.path, "add", ".");
    await git("-C", result.path, "commit", "-m", "Unrelated");
    await expect(createProjectWorktree(project, options())).rejects.toThrow("not the requested worktree");
  });

  it("sets a missing upstream without discarding local commits and refuses conflicting upstreams", async () => {
    await git("-C", project.path, "switch", "--no-track", "-c", "feature/existing", "origin/feature/existing");
    await writeFile(join(project.path, "unpublished"), "local feature commit");
    await git("-C", project.path, "add", ".");
    await git("-C", project.path, "commit", "-m", "Unpublished");
    const head = await git("-C", project.path, "rev-parse", "HEAD");
    await git("-C", project.path, "switch", "main");
    const result = await createProjectWorktree(project, { ...options(), branch: "feature/existing" });
    expect(await git("-C", result.path, "rev-parse", "HEAD")).toBe(head);
    expect(await git("-C", result.path, "rev-parse", "--abbrev-ref", "@{upstream}")).toBe("origin/feature/existing");
    await git("-C", project.path, "branch", "--set-upstream-to=origin/main", "feature/existing");
    await expect(createProjectWorktree(project, { ...options(), branch: "feature/existing" })).rejects.toThrow("tracks a different upstream");
  });

  it("refuses invalid branch names, a default-branch worktree, and absent bases", async () => {
    for (const branch of ["main", "../escape", "@{-1}", "--force"]) {
      await expect(createProjectWorktree(project, { ...options(), branch })).rejects.toThrow();
    }
    await expect(createProjectWorktree(project, { ...options(), base: "missing" })).rejects.toThrow("base origin/missing is unavailable");
  });

  it("passes branch and base options through the CLI", async () => {
    await writeFile(join(root, "projects.yml"), `defaults:\n  default_branch: main\n  setup_script: scripts/setup.sh\n  issue_tracker:\n    type: github\nprojects:\n  example-project:\n    remote: ${join(root, "origin.git")}\n`);
    await exec(process.execPath, ["--import", createRequire(import.meta.url).resolve("tsx"), resolve("scripts/create-worktree.ts"), "--branch", "feature/existing", "--base", "feature/base", "example-project", "13", "CLI tracking"], { cwd: root, env });
    expect(await readWorktreeBase(project.path, "feature/existing", run)).toBe("origin/feature/base");
    expect(await git("-C", join(root, ".worktrees", "example-project", "13-cli-tracking"), "rev-parse", "--abbrev-ref", "@{upstream}")).toBe("origin/feature/existing");
  });
});
