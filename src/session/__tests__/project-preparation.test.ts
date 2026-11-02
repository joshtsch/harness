import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectDefinition } from "../../project-config.js";
import { verifyPreparedProject, type ProjectSetupOptions, type SetupCommandRunner } from "../project-setup.js";

const project: ProjectDefinition = {
  name: "example-project", remote: "remote", defaultBranch: "main", setupScript: "scripts/setup.sh",
  issueTracker: { type: "github" },
  quality: {
    lint: { command: "lint", args: [], required: true },
    format: { command: "format", args: [], required: true },
  },
  verification: [{ command: "check", args: [], required: true }],
  workflows: [{ command: "optional", args: [], required: false }],
};

describe("prepared project verification", () => {
  let root: string;
  let options: ProjectSetupOptions;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "harness-preparation-"));
    options = { projectRoot: join(root, "clone"), harnessRoot: root, issueKey: "131", purpose: "Share preparation", sessionId: "session", logDirectory: join(root, "logs") };
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("checks cleanliness around required quality commands using the setup context", async () => {
    const calls: string[] = [];
    const worktreePath = join(root, "worktree");
    const run: SetupCommandRunner = async (command, _args, context) => {
      calls.push(command);
      expect(context.cwd).toBe(worktreePath);
      if (command !== "git") expect(context.env).toMatchObject({
        HARNESS_PROJECT_NAME: "example-project", HARNESS_ROOT: root, HARNESS_SESSION_ID: "session",
        HARNESS_ISSUE_KEY: "131", HARNESS_PURPOSE: "Share preparation", HARNESS_WORKTREE_PATH: worktreePath,
      });
      return { code: 0, stdout: command === "git" ? "" : "passed", stderr: "" };
    };

    await expect(verifyPreparedProject({ project, options, worktreePath, run })).resolves.toEqual([]);
    expect(calls).toEqual(["git", "lint", "format", "git"]);
    expect(await readFile(join(root, "logs/session/example-project-workflow-1.log"), "utf8")).toContain("command=lint");
  });

  it.each([
    { failure: "initial-cleanliness", expected: ["git"], message: "worktree is not clean" },
    { failure: "lint", expected: ["git", "lint"], message: "command failed" },
    { failure: "format", expected: ["git", "lint", "format"], message: "command failed" },
    { failure: "final-cleanliness", expected: ["git", "lint", "format", "git"], message: "worktree is not clean" },
    { failure: "check", expected: ["git", "lint", "format", "git", "check"], message: "command failed" },
  ])("stops subsequent work after $failure fails", async ({ failure, expected, message }) => {
    const calls: string[] = [];
    const run: SetupCommandRunner = async (command) => {
      calls.push(command);
      const dirty = command === "git" && (failure === "initial-cleanliness" || failure === "final-cleanliness" && calls.length > 1);
      return { code: command === failure ? 1 : 0, stdout: dirty ? " M changed" : "", stderr: "" };
    };

    await expect(verifyPreparedProject({ project, options, worktreePath: join(root, "worktree"), run }, [
      ...project.verification, ...project.workflows,
    ])).rejects.toThrow(message);
    expect(calls).toEqual(expected);
  });

  it("returns optional failures and continues requested session commands", async () => {
    const calls: string[] = [];
    const run: SetupCommandRunner = async (command) => {
      calls.push(command);
      return { code: command === "optional" ? 3 : 0, stdout: "", stderr: command === "optional" ? "optional check failed" : "" };
    };
    const failures = await verifyPreparedProject({ project, options, worktreePath: join(root, "worktree"), run }, [
      ...project.workflows, ...project.verification,
    ]);

    expect(calls).toEqual(["git", "lint", "format", "git", "optional", "check"]);
    expect(failures).toHaveLength(1);
    expect(failures[0].error.message).toContain("command failed");
    expect(await readFile(join(root, "logs/session/session.events.jsonl"), "utf8")).toContain('"type":"workflow-failed"');
    expect(await readFile(join(root, "logs/session/example-project-workflow-1.log"), "utf8")).toContain("optional check failed");
  });
});
