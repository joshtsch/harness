import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordSetupEvent, runProjectCommands, runProjectSetup, runProjectSetupSession, verifyProjectReady, type SetupCommandRunner } from "../project-setup.js";

const project = { name: "example-project", remote: "remote", defaultBranch: "main", setupScript: "scripts/setup.sh", issueTracker: { type: "github" }, verification: [], workflows: [] };
const base = { projectRoot: "/workspace/projects/example-project", worktreePath: "/workspace/.worktrees/example-project/issue-2-setup", issueKey: "issue-2", purpose: "Implement setup", harnessRoot: "/workspace", sessionId: "session-1" };

describe("project setup", () => {
  it("records refresh requests in session events", async () => {
    const logDirectory = await mkdtemp(join(tmpdir(), "harness-setup-"));
    await recordSetupEvent({ logDirectory, sessionId: base.sessionId }, { type: "clone-refresh-requested", project: project.name });
    await expect(readFile(join(logDirectory, "session-1/session.events.jsonl"), "utf8"))
      .resolves.toContain('"type":"clone-refresh-requested"');
    await rm(logDirectory, { recursive: true, force: true });
  });

  it("runs each phase in its project root with stable metadata and preserves logs", async () => {
    const logDirectory = await mkdtemp(join(tmpdir(), "harness-setup-"));
    const run = vi.fn<SetupCommandRunner>().mockResolvedValue({ code: 0, stdout: "ready\n", stderr: "" });
    await runProjectSetup(project, "worktree", { ...base, logDirectory, run });
    expect(run).toHaveBeenCalledWith("bash", ["/workspace/.worktrees/example-project/issue-2-setup/scripts/setup.sh", "worktree"], expect.objectContaining({
      cwd: base.worktreePath,
      env: expect.objectContaining({ HARNESS_PROJECT_NAME: "example-project", HARNESS_ISSUE_KEY: "issue-2", HARNESS_SESSION_ID: "session-1" }),
    }));
    await expect(readFile(join(logDirectory, "session-1/example-project-worktree.log"), "utf8")).resolves.toContain("ready");
    await runProjectSetup(project, "worktree", { ...base, logDirectory, run });
    expect(run).toHaveBeenCalledTimes(1);
    await expect(readFile(join(logDirectory, "session-1/example-project-worktree.state.json"), "utf8")).resolves.toContain('"status":"complete"');
    await rm(logDirectory, { recursive: true, force: true });
  });

  it("fails closed while retaining the failure log", async () => {
    const logDirectory = await mkdtemp(join(tmpdir(), "harness-setup-"));
    const run = vi.fn<SetupCommandRunner>().mockResolvedValue({ code: 7, stdout: "", stderr: "bad dependency" });
    await expect(runProjectSetup(project, "bootstrap", { ...base, logDirectory, run })).rejects.toThrow("bootstrap setup failed");
    await expect(readFile(join(logDirectory, "session-1/example-project-bootstrap.log"), "utf8")).resolves.toContain("bad dependency");
    await expect(readFile(join(logDirectory, "session-1/example-project-bootstrap.state.json"), "utf8")).resolves.toContain('"status":"failed"');
    await rm(logDirectory, { recursive: true, force: true });
  });

  it("verifies a clean worktree", async () => {
    const run = vi.fn<SetupCommandRunner>().mockResolvedValue({ code: 0, stdout: "", stderr: "" });
    await expect(verifyProjectReady(base.worktreePath, run)).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledWith("git", ["-C", base.worktreePath, "status", "--porcelain", "--untracked-files=all"], expect.anything());
  });

  it("rejects a dirty worktree during verification", async () => {
    const run = vi.fn<SetupCommandRunner>().mockResolvedValue({ code: 0, stdout: " M file", stderr: "" });
    await expect(verifyProjectReady(base.worktreePath, run)).rejects.toThrow("worktree is not clean");
  });

  it("stops a multi-project session when a required setup fails", async () => {
    const logDirectory = await mkdtemp(join(tmpdir(), "harness-setup-"));
    const run = vi.fn<SetupCommandRunner>().mockResolvedValue({ code: 2, stdout: "", stderr: "failed" });
    await expect(runProjectSetupSession([
      { project, phase: "bootstrap", options: { ...base, logDirectory, run } },
      { project, phase: "worktree", options: { ...base, logDirectory, run } },
    ])).rejects.toThrow("bootstrap setup failed");
    expect(run).toHaveBeenCalledTimes(1);
    await expect(readFile(join(logDirectory, "session-1/session.events.jsonl"), "utf8")).resolves.toContain('"type":"setup-failed"');
    await rm(logDirectory, { recursive: true, force: true });
  });

  it("continues past an explicitly optional failure", async () => {
    const logDirectory = await mkdtemp(join(tmpdir(), "harness-setup-"));
    const run = vi.fn<SetupCommandRunner>()
      .mockResolvedValueOnce({ code: 2, stdout: "", stderr: "optional failed" })
      .mockResolvedValueOnce({ code: 0, stdout: "ready", stderr: "" });
    const result = await runProjectSetupSession([
      { project, phase: "bootstrap", options: { ...base, logDirectory, run }, required: false },
      { project, phase: "worktree", options: { ...base, logDirectory, run } },
    ]);
    expect(result.optionalFailures).toHaveLength(1);
    expect(result.results).toHaveLength(1);
    await rm(logDirectory, { recursive: true, force: true });
  });

  it("runs commands in worktree and preserves optional failure logs", async () => {
    const logDirectory = await mkdtemp(join(tmpdir(), "harness-setup-"));
    const run = vi.fn<SetupCommandRunner>()
      .mockResolvedValueOnce({ code: 3, stdout: "", stderr: "lint failed" })
      .mockResolvedValueOnce({ code: 0, stdout: "tests passed", stderr: "" });
    const failures = await runProjectCommands([
      { command: "pnpm", args: ["lint"], required: false },
      { command: "pnpm", args: ["test"], required: true },
    ], { project, worktreePath: base.worktreePath, options: { ...base, logDirectory }, run });
    expect(failures).toHaveLength(1);
    expect(run).toHaveBeenNthCalledWith(1, "pnpm", ["lint"], expect.objectContaining({ cwd: base.worktreePath, env: expect.objectContaining({ HARNESS_WORKTREE_PATH: base.worktreePath }) }));
    await expect(readFile(join(logDirectory, "session-1/example-project-workflow-1.log"), "utf8")).resolves.toContain("lint failed");
    await rm(logDirectory, { recursive: true, force: true });
  });

  it("fails required command and retains its log", async () => {
    const logDirectory = await mkdtemp(join(tmpdir(), "harness-setup-"));
    const run = vi.fn<SetupCommandRunner>().mockResolvedValue({ code: 4, stdout: "", stderr: "tests failed" });
    await expect(runProjectCommands([{ command: "pnpm", args: ["test"], required: true }], {
      project, worktreePath: base.worktreePath, options: { ...base, logDirectory }, run,
    })).rejects.toThrow("command failed");
    await expect(readFile(join(logDirectory, "session-1/example-project-workflow-1.log"), "utf8")).resolves.toContain("tests failed");
    await rm(logDirectory, { recursive: true, force: true });
  });
});
