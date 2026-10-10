import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { resolveWorktreeRoot } from "../worktree-root.js";
import { createProjectWorktree, type CommandRunner } from "../worktree.js";

const execute = promisify(execFile);
const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "harness-root-test-"));
  directories.push(directory);
  const harness = join(directory, "harness");
  await mkdir(harness);
  return { directory: await realpath(directory), harness: await realpath(harness) };
}
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("managed worktree root", () => {
  it("defaults to a sibling and honors a relative external override", async () => {
    const { directory, harness } = await fixture();
    expect(await resolveWorktreeRoot(harness, "")).toBe(join(directory, "harness-worktrees"));
    expect(await resolveWorktreeRoot(harness, "../custom/trees")).toBe(join(directory, "custom/trees"));
  });

  it("rejects the harness itself, internal roots, and symlink aliases through missing descendants", async () => {
    const { directory, harness } = await fixture();
    await symlink(harness, join(directory, "alias"));
    for (const root of [harness, ".worktrees", join(directory, "alias/new/trees")]) {
      await expect(resolveWorktreeRoot(harness, root)).rejects.toThrow("worktree root must be outside the harness");
    }
    await expect(resolveWorktreeRoot(join(directory, "alias"), "../harness/.worktrees")).rejects.toThrow("worktree root must be outside the harness");
  });

  it("creates an external Git worktree and records harness discovery from it", async () => {
    const { directory, harness } = await fixture();
    const origin = join(directory, "origin.git");
    const clone = join(harness, "projects/example");
    await execute("git", ["init", "--bare", "--initial-branch=main", origin]);
    await execute("git", ["clone", origin, clone]);
    await execute("git", ["-C", clone, "config", "user.name", "Test"]);
    await execute("git", ["-C", clone, "config", "user.email", "test@localhost"]);
    await writeFile(join(clone, "README.md"), "fixture\n");
    await execute("git", ["-C", clone, "add", "."]);
    await execute("git", ["-C", clone, "commit", "-m", "initial"]);
    await execute("git", ["-C", clone, "push", "origin", "main"]);
    const legacy = join(harness, ".worktrees/example/legacy");
    await execute("git", ["-C", clone, "worktree", "add", "-b", "legacy", legacy, "main"]);
    await writeFile(join(legacy, "untracked.txt"), "preserve me\n");
    const run: CommandRunner = async (command, args) => {
      const { stdout, stderr } = await execute(command, args);
      return { code: 0, stdout, stderr };
    };
    const root = await resolveWorktreeRoot(harness, join(directory, "custom"));
    const options = { harnessRoot: harness, worktreesDirectory: root, issueKey: "9", ticketTitle: "External root", run };
    const result = await createProjectWorktree({ name: "example", path: clone, defaultBranch: "main" }, options);
    expect(dirname(dirname(result.path))).toBe(root);
    expect((await execute("git", ["-C", result.path, "config", "--get", "harness.root"])).stdout.trim()).toBe(harness);
    expect(await readFile(join(legacy, "untracked.txt"), "utf8")).toBe("preserve me\n");
    expect((await execute("git", ["-C", clone, "worktree", "list", "--porcelain"])).stdout).toContain(`worktree ${legacy}`);
    await expect(createProjectWorktree({ name: "example", path: clone, defaultBranch: "main" }, options)).resolves.toMatchObject({ action: "existing", path: result.path });
    await mkdir(join(harness, "internal"));
    await symlink(join(harness, "internal"), join(root, "alias-project"));
    await expect(createProjectWorktree({ name: "alias-project", path: clone, defaultBranch: "main" }, { ...options, issueKey: "10" })).rejects.toThrow("worktree root must be outside the harness");
  });
});
