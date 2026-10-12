import { describe, expect, it, vi } from "vitest";
import { createSessionProviderIntegrations } from "../../schedules/index.js";
import { createSessionManifest } from "../session-manifest.js";
import { prepareSession, type ProjectClone, type SessionPreparationDependencies, type SessionPreparationOptions } from "../session-preparation.js";
import type { ProjectDefinition, SessionContext } from "../../project-config.js";
import type { SetupFailure, SetupStep } from "../project-setup.js";
import type { WorktreeResult } from "../worktree.js";

const project: ProjectDefinition = {
  name: "example-project",
  remote: "https://example.com/example-project.git",
  defaultBranch: "main",
  setupScript: "scripts/setup.sh",
  issueTracker: { type: "github", repository: "org/example-project" },
  quality: {
    lint: { command: "pnpm", args: ["lint"], required: true },
    format: { command: "pnpm", args: ["format:check"], required: true },
  },
  verification: [{ command: "pnpm", args: ["test"], required: true }],
  workflows: [{ command: "pnpm", args: ["lint"], required: false }],
};
const session: SessionContext = {
  sessionId: "issue-39",
  toolMappings: { crm: { provider: "attio", targets: [{ id: "session", access: "read_write" }] } },
};

const options: SessionPreparationOptions = {
  selected: [project],
  projectsDirectory: "/workspace/projects",
  worktreesDirectory: "/workspace/.worktrees",
  issueKey: "39",
  purpose: "Extract session preparation",
  harnessRoot: "/workspace",
  session,
  logDirectory: "/workspace/docs/.scratch/setup",
  run: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
  writeManifest: vi.fn(async () => undefined),
};

function dependencies(overrides: Partial<SessionPreparationDependencies> = {}): SessionPreparationDependencies {
  return {
    ensureClone: vi.fn(async (): Promise<ProjectClone> => ({ action: "existing", path: "/workspace/projects/example-project" })),
    refreshClone: vi.fn(async () => ({ status: "current" as const })),
    runSetupSession: vi.fn(async () => ({ results: [], optionalFailures: [] })),
    createWorktree: vi.fn(async (): Promise<WorktreeResult> => ({ action: "created", branch: "issue-39-extract-session-preparation", name: "issue-39-extract-session-preparation", path: "/workspace/.worktrees/example-project/issue-39-extract-session-preparation", base: "origin/main" })),
    verifyProject: vi.fn(async () => undefined),
    runCommands: vi.fn(async () => []),
    recordEvent: vi.fn(async () => undefined),
    writeManifest: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("prepareSession", () => {
  it("prepares a project in lifecycle order and records completion", async () => {
    const deps = dependencies();
    const result = await prepareSession(options, deps);

    expect(result.states[project.name]).toMatchObject({ status: "verified", path: expect.any(String) });
    expect(deps.runSetupSession).toHaveBeenNthCalledWith(1, [expect.objectContaining({ phase: "bootstrap" })]);
    expect(deps.runSetupSession).toHaveBeenNthCalledWith(2, [expect.objectContaining({ phase: "worktree" })]);
    expect(deps.verifyProject).toHaveBeenCalledTimes(2);
    expect(deps.runCommands).toHaveBeenNthCalledWith(1, [project.quality!.lint, project.quality!.format], expect.objectContaining({ project }));
    expect(deps.runCommands).toHaveBeenNthCalledWith(2, [...project.verification, ...project.workflows], expect.objectContaining({ project }));
    expect(deps.writeManifest).toHaveBeenLastCalledWith("complete", result.states);

    const update = vi.fn(async () => ({ id: "updated" }));
    await createSessionProviderIntegrations(session, { ...project, businessLines: [] }, {}, {
      crm: { attio: { search: vi.fn(), get: vi.fn(), update } },
    }).updateCrmRecord("record", { name: "Session" });
    expect(update).toHaveBeenCalledWith("session", "record", { name: "Session" });
    expect(createSessionManifest(session, {
      issueKey: "39",
      purpose: options.purpose,
      goal: "Prove session preparation behavior",
      issue: { key: "39", number: 39, repository: "example/repo" },
      projects: result.states,
      status: "complete",
    }).toolMappings).toEqual(["crm"]);
  });

  it("refuses to start before cloning when lint and format checks are missing", async () => {
    const deps = dependencies();
    const projectWithoutQuality = { ...project, quality: undefined };

    await expect(prepareSession({ ...options, selected: [projectWithoutQuality] }, deps)).rejects.toThrow("must configure required lint and format checks");
    expect(deps.ensureClone).not.toHaveBeenCalled();
    expect(deps.writeManifest).not.toHaveBeenCalled();
  });

  it("checks the worktree again after required lint and format commands", async () => {
    const verifyProject = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("worktree verification failed: worktree is not clean"));
    const runCommands = vi.fn(async () => []);
    const deps = dependencies({ verifyProject, runCommands });

    await expect(prepareSession(options, deps)).rejects.toThrow("worktree is not clean");
    expect(runCommands).toHaveBeenCalledOnce();
    expect(runCommands).toHaveBeenCalledWith([project.quality!.lint, project.quality!.format], expect.objectContaining({ project }));
    expect(verifyProject.mock.invocationCallOrder[1]).toBeGreaterThan(runCommands.mock.invocationCallOrder[0]!);
  });

  it("stops and records required setup failure", async () => {
    const deps = dependencies({ runSetupSession: vi.fn(async () => { throw new Error("setup failed"); }) });

    await expect(prepareSession(options, deps)).rejects.toThrow("setup failed");
    expect(deps.createWorktree).not.toHaveBeenCalled();
    expect(deps.writeManifest).toHaveBeenLastCalledWith("failed", expect.objectContaining({ [project.name]: expect.objectContaining({ status: "failed", stage: "bootstrap" }) }), expect.objectContaining({ project: project.name, stage: "bootstrap" }));
  });

  it("records clone failure before bootstrap starts", async () => {
    const deps = dependencies({ ensureClone: vi.fn(async () => { throw new Error("clone failed"); }) });

    await expect(prepareSession(options, deps)).rejects.toThrow("clone failed");
    expect(deps.runSetupSession).not.toHaveBeenCalled();
    expect(deps.writeManifest).toHaveBeenLastCalledWith("failed", expect.objectContaining({ [project.name]: expect.objectContaining({ stage: "clone" }) }), expect.anything());
  });

  it("records worktree failure after bootstrap", async () => {
    const deps = dependencies({ createWorktree: vi.fn(async () => { throw new Error("worktree failed"); }) });

    await expect(prepareSession(options, deps)).rejects.toThrow("worktree failed");
    expect(deps.runSetupSession).toHaveBeenCalledOnce();
    expect(deps.verifyProject).not.toHaveBeenCalled();
    expect(deps.writeManifest).toHaveBeenLastCalledWith("failed", expect.objectContaining({ [project.name]: expect.objectContaining({ stage: "worktree" }) }), expect.anything());
  });

  it("records verification failure after worktree setup", async () => {
    const deps = dependencies({ verifyProject: vi.fn(async () => { throw new Error("verification failed"); }) });

    await expect(prepareSession(options, deps)).rejects.toThrow("verification failed");
    expect(deps.runSetupSession).toHaveBeenCalledTimes(2);
    expect(deps.writeManifest).toHaveBeenLastCalledWith("failed", expect.objectContaining({ [project.name]: expect.objectContaining({ stage: "verification" }) }), expect.anything());
  });

  it("keeps optional workflow failures in the verified state", async () => {
    const deps = dependencies({ runCommands: vi.fn(async (): Promise<SetupFailure[]> => [{ phase: "worktree", error: new Error("lint failed") }]) });

    const result = await prepareSession(options, deps);

    expect(result.states[project.name]).toMatchObject({ status: "verified", optionalFailures: ["Error: lint failed"] });
  });

  it("supports rerun with existing clone and worktree", async () => {
    const deps = dependencies({
      createWorktree: vi.fn(async (): Promise<WorktreeResult> => ({ action: "existing", branch: "issue-39-extract-session-preparation", name: "issue-39-extract-session-preparation", path: "/workspace/.worktrees/example-project/issue-39-extract-session-preparation", base: "origin/main" })),
    });

    await prepareSession(options, deps);
    const result = await prepareSession(options, deps);

    expect(deps.ensureClone).toHaveBeenCalledTimes(2);
    expect(deps.createWorktree).toHaveBeenCalledTimes(2);
    expect(result.states[project.name]?.status).toBe("verified");
  });

  it("keeps bootstrap and worktree phases ordered across projects", async () => {
    const secondProject = { ...project, name: "night-owls" };
    const setup = vi.fn(async (_steps: SetupStep[]) => ({ results: [], optionalFailures: [] }));
    const deps = dependencies({ runSetupSession: setup });
    const multiProjectOptions = { ...options, selected: [project, secondProject] };

    await prepareSession(multiProjectOptions, deps);

    expect(setup.mock.calls.map(([steps]) => `${steps[0]!.project.name}:${steps[0]!.phase}`)).toEqual([
      "example-project:bootstrap",
      "night-owls:bootstrap",
      "example-project:worktree",
      "night-owls:worktree",
    ]);
  });

  it("reports every project refresh before refusing to bootstrap a skipped clone", async () => {
    const report = vi.fn();
    const deps = dependencies({ refreshClone: vi.fn(async (selected) => selected.name === project.name ? { status: "skipped" as const, reason: "working tree is dirty" } : { status: "updated" as const }) });
    await expect(prepareSession({ ...options, selected: [project, { ...project, name: "second" }], onProjectRefresh: report }, deps)).rejects.toThrow("skipped");
    expect(report.mock.calls).toEqual([[project.name, { status: "skipped", reason: "working tree is dirty" }], ["second", { status: "updated" }]]);
    expect(deps.runSetupSession).not.toHaveBeenCalled();
    expect(deps.createWorktree).not.toHaveBeenCalled();
    expect(deps.writeManifest).toHaveBeenLastCalledWith("failed", expect.objectContaining({ [project.name]: expect.objectContaining({ refresh: { status: "skipped", reason: "working tree is dirty" }, stage: "refresh" }), second: expect.objectContaining({ refresh: { status: "updated" } }) }), expect.anything());
  });
});
