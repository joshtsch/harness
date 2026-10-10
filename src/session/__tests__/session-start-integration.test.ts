import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { refreshProjectClone } from "../project-refresh.js";
import type { CommandRunner, WorktreeProject } from "../worktree.js";

const exec = promisify(execFile);
const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@localhost", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@localhost", HARNESS_OPTIMIZATION_ENABLED: "0", HARNESS_AGENT_PROVIDER: "codex" };
const run: CommandRunner = async (command, args) => {
  try { return { code: 0, ...await exec(command, args, { env }) }; }
  catch (error: any) { return { code: typeof error.code === "number" ? error.code : 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }; }
};
async function git(...args: string[]): Promise<string> {
  const result = await run("git", args);
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

describe("session startup with real Git", () => {
  let root: string;
  let seed: string;
  let remote: string;
  let project: WorktreeProject;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "harness-session-start-test-"));
    seed = join(root, "seed");
    remote = join(root, "origin.git");
    await git("init", "--bare", "--initial-branch=main", remote);
    await git("init", "--initial-branch=main", seed);
    await mkdir(join(seed, "scripts"));
    await writeFile(join(seed, "scripts/setup.sh"), "#!/bin/sh\nexit 0\n");
    await writeFile(join(seed, "AGENTS.md"), "Project fixture rules.\n");
    await git("-C", seed, "add", ".");
    await git("-C", seed, "commit", "-m", "Fixture");
    await git("-C", seed, "remote", "add", "origin", remote);
    await git("-C", seed, "push", "origin", "main");
    project = { name: "example-project", path: join(root, "projects", "example-project"), defaultBranch: "main" };
    await git("clone", remote, project.path);
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); await rm(root + "-worktrees", { recursive: true, force: true }); });
  async function advanceRemote(): Promise<string> {
    await writeFile(join(seed, "remote-change"), "updated\n");
    await git("-C", seed, "add", ".");
    await git("-C", seed, "commit", "-m", "Remote change");
    await git("-C", seed, "push", "origin", "main");
    return git("-C", seed, "rev-parse", "HEAD");
  }

  it("reports current, then safely fast-forwards a clean behind clone", async () => {
    expect(await refreshProjectClone(project, run)).toEqual({ status: "current" });
    const head = await advanceRemote();
    expect(await refreshProjectClone(project, run)).toEqual({ status: "updated" });
    expect(await git("-C", project.path, "rev-parse", "HEAD")).toBe(head);
    expect(await refreshProjectClone(project, run)).toEqual({ status: "current" });
  });

  it("preserves dirty tracked files and untracked files", async () => {
    await advanceRemote();
    const head = await git("-C", project.path, "rev-parse", "HEAD");
    await writeFile(join(project.path, "AGENTS.md"), "Local edits\n");
    expect(await refreshProjectClone(project, run)).toEqual({ status: "skipped", reason: "working tree is dirty" });
    await git("-C", project.path, "restore", "AGENTS.md");
    await writeFile(join(project.path, "untracked"), "Keep this\n");
    expect((await refreshProjectClone(project, run)).status).toBe("skipped");
    expect(await git("-C", project.path, "rev-parse", "HEAD")).toBe(head);
    expect(await readFile(join(project.path, "untracked"), "utf8")).toBe("Keep this\n");
  });

  it("preserves ahead and divergent commits", async () => {
    await writeFile(join(project.path, "local-change"), "local\n");
    await git("-C", project.path, "add", ".");
    await git("-C", project.path, "commit", "-m", "Local change");
    const head = await git("-C", project.path, "rev-parse", "HEAD");
    expect((await refreshProjectClone(project, run)).status).toBe("skipped");
    await advanceRemote();
    expect((await refreshProjectClone(project, run)).status).toBe("skipped");
    expect(await git("-C", project.path, "rev-parse", "HEAD")).toBe(head);
  });

  it("skips a nondefault checkout and an unavailable remote", async () => {
    await git("-C", project.path, "switch", "-c", "feature/local");
    expect(await refreshProjectClone(project, run)).toEqual({ status: "skipped", reason: "default branch is not checked out" });
    await git("-C", project.path, "switch", "main");
    await git("-C", project.path, "remote", "set-url", "origin", join(root, "missing.git"));
    expect(await refreshProjectClone(project, run)).toEqual({ status: "skipped", reason: "origin fetch failed" });
  });

  it("writes the explicit goal to the manifest and session AGENTS.md through the CLI", async () => {
    const head = await advanceRemote();
    await writeFile(join(root, "projects.yml"), `defaults:\n  default_branch: main\n  setup_script: scripts/setup.sh\n  issue_tracker:\n    type: github\n    repository: example/fixture\nprojects:\n  example-project:\n    remote: ${remote}\n`);
    const bin = join(root, "bin");
    await mkdir(bin);
    for (const command of ["pnpm", "npx", "codex", "age", "bw"]) await writeFile(join(bin, command), "#!/bin/sh\nprintf 'fixture-version\\n'\n", { mode: 0o755 });
    await writeFile(join(bin, "gh"), '#!/bin/sh\nprintf \'{"number":12,"title":"Refresh session"}\\n\'\n', { mode: 0o755 });
    const goal = "Prove safe session startup";
    const result = await exec(process.execPath, ["--import", createRequire(import.meta.url).resolve("tsx"), resolve("scripts/setup-session.ts"), "--goal", goal, "example-project", "12"], { cwd: root, env: { ...env, HARNESS_WORKTREE_ROOT: root + "-worktrees", PATH: `${bin}:${env.PATH}` } });
    expect(result.stdout).toContain("example-project: updated");
    const sessionRoot = join(root, "docs/.scratch/setup/12-refresh-session");
    const manifest = JSON.parse(await readFile(join(sessionRoot, "session.json"), "utf8"));
    expect(manifest).toMatchObject({ goal, purpose: "Refresh session", agentInstructions: "AGENTS.md", status: "complete", projects: { "example-project": { refresh: { status: "updated" } } } });
    expect(await readFile(join(sessionRoot, "AGENTS.md"), "utf8")).toContain(`Goal: ${goal}`);
    expect(await readFile(join(project.path, "AGENTS.md"), "utf8")).toBe("Project fixture rules.\n");
    expect(await git("-C", project.path, "rev-parse", "HEAD")).toBe(head);
    expect(await git("-C", project.path, "status", "--porcelain")).toBe("");
  });
});
