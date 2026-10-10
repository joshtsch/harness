import type { ProjectDefinition, SessionContext, WorkflowCommand } from "../project-config.js";
import { ensureProjectClone, type ProjectClone } from "./project-clone.js";
import { createProjectWorktree, type WorktreeProject, type WorktreeResult } from "./worktree.js";
import { recordSetupEvent, runProjectCommands, runProjectSetupSession, verifyProjectReady, type SetupCommandRunner, type SetupSessionResult, type SetupStep, type SetupFailure, type VerificationOptions } from "./project-setup.js";
import { refreshProjectClone, type ProjectRefreshResult } from "./project-refresh.js";

export type { ProjectClone } from "./project-clone.js";

export interface PreparationProjectState {
  status: string;
  path?: string;
  branch?: string;
  optionalFailures?: string[];
  stage?: string;
  error?: string;
  refresh?: ProjectRefreshResult;
}

export interface PreparationFailure {
  project: string;
  stage: string;
  error: unknown;
}

export interface WorktreePreparationOptions {
  worktreesDirectory: string;
  issueKey: string;
  ticketTitle: string;
  refresh?: boolean;
  onRefresh?: () => Promise<void>;
  run: (command: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
}

export interface SessionPreparationOptions {
  selected: ProjectDefinition[];
  projectsDirectory: string;
  worktreesDirectory: string;
  issueKey: string;
  purpose: string;
  harnessRoot: string;
  session: SessionContext;
  logDirectory: string;
  onProjectRefresh?: (project: string, result: ProjectRefreshResult) => void;
  run: SetupCommandRunner;
  writeManifest: (status: string, states: Record<string, PreparationProjectState>, failure?: PreparationFailure) => Promise<void>;
}

export interface SessionPreparationAdapters {
  ensureClone: (project: ProjectDefinition, projectsDirectory: string) => Promise<ProjectClone>;
  refreshClone: (project: WorktreeProject) => Promise<ProjectRefreshResult>;
  runSetupSession: (steps: SetupStep[]) => Promise<SetupSessionResult>;
  createWorktree: (project: WorktreeProject, options: WorktreePreparationOptions) => Promise<WorktreeResult>;
  verifyProject: (path: string, run: SetupCommandRunner) => Promise<void>;
  runCommands: (commands: WorkflowCommand[], options: VerificationOptions) => Promise<SetupFailure[]>;
  recordEvent: (options: { logDirectory: string; sessionId: string }, event: Record<string, unknown>) => Promise<void>;
  writeManifest: (status: string, states: Record<string, PreparationProjectState>, failure?: PreparationFailure) => Promise<void>;
}

export type SessionPreparationDependencies = SessionPreparationAdapters;

export interface SessionPreparationResult {
  states: Record<string, PreparationProjectState>;
  worktrees: WorktreeResult[];
}

function defaultAdapters(options: SessionPreparationOptions): SessionPreparationAdapters {
  return {
    ensureClone: (project, projectsDirectory) => ensureProjectClone(project, { projectsDirectory, run: (command, args) => options.run(command, args, { cwd: options.harnessRoot, env: process.env }) }),
    refreshClone: (project) => refreshProjectClone(project, (command, args) => options.run(command, args, { cwd: project.path, env: process.env })),
    runSetupSession: runProjectSetupSession,
    createWorktree: createProjectWorktree,
    verifyProject: verifyProjectReady,
    runCommands: runProjectCommands,
    recordEvent: recordSetupEvent,
    writeManifest: options.writeManifest,
  };
}

export async function prepareSession(options: SessionPreparationOptions, adapters: SessionPreparationAdapters = defaultAdapters(options)): Promise<SessionPreparationResult> {
  if (!/^\d+$/.test(options.issueKey)) throw new Error("issue-bound session requires a tracker issue key");
  const states: Record<string, PreparationProjectState> = Object.fromEntries(options.selected.map((project) => [project.name, { status: "pending" }]));
  const eventOptions = { logDirectory: options.logDirectory, sessionId: options.session.sessionId };
  const failSession = async (project: string, stage: string, error: unknown): Promise<never> => {
    states[project] = { ...states[project], status: "failed", stage, error: String(error) };
    await adapters.recordEvent(eventOptions, { type: "session-failed", project, stage, error: String(error) });
    await adapters.writeManifest("failed", states, { project, stage, error });
    throw error;
  };
  const clones: ProjectClone[] = [];

  for (const project of options.selected) {
    try {
      const clone = await adapters.ensureClone(project, options.projectsDirectory);
      clones.push(clone);
      states[project.name] = { status: "clone-ready", path: clone.path };
      await adapters.writeManifest("running", states);
      await adapters.recordEvent(eventOptions, { type: "clone-ready", project: project.name, path: clone.path });
    } catch (error) {
      await failSession(project.name, "clone", error);
    }
  }

  const common = options.selected.map((project, index) => ({
    project,
    options: { projectRoot: clones[index].path, issueKey: options.issueKey, purpose: options.purpose, harnessRoot: options.harnessRoot, sessionId: options.session.sessionId, logDirectory: options.logDirectory, run: options.run },
  }));
  for (let index = 0; index < options.selected.length; index += 1) {
    const project = options.selected[index];
    const result = await adapters.refreshClone({ name: project.name, path: clones[index].path, defaultBranch: project.defaultBranch });
    states[project.name] = { ...states[project.name], refresh: result };
    options.onProjectRefresh?.(project.name, result);
    await adapters.recordEvent(eventOptions, { type: "project-refresh", project: project.name, ...result });
    await adapters.writeManifest("running", states);
  }
  const skipped = options.selected.find((project) => states[project.name].refresh?.status === "skipped");
  if (skipped) await failSession(skipped.name, "refresh", new Error(`project ${skipped.name} skipped: ${states[skipped.name].refresh?.reason}`));

  for (const { project, options: setupOptions } of common) {
    try {
      await adapters.runSetupSession([{ project, phase: "bootstrap", options: setupOptions }]);
    } catch (error) {
      await failSession(project.name, "bootstrap", error);
    }
  }

  const worktrees: WorktreeResult[] = [];
  for (let index = 0; index < options.selected.length; index += 1) {
    const project = options.selected[index]!;
    try {
      const worktree = await adapters.createWorktree({ name: project.name, path: clones[index].path, defaultBranch: project.defaultBranch }, {
        worktreesDirectory: options.worktreesDirectory,
        issueKey: options.issueKey,
        ticketTitle: options.purpose,
        refresh: false,
        run: async (command, args) => options.run(command, args, { cwd: clones[index].path, env: process.env }),
      });
      worktrees.push(worktree);
    } catch (error) {
      await failSession(project.name, "worktree", error);
    }
    const worktree = worktrees[index]!;
    await adapters.recordEvent(eventOptions, { type: "worktree-ready", project: project.name, path: worktree.path, branch: worktree.branch });
    states[project.name] = { ...states[project.name], status: "worktree-ready", path: worktree.path, branch: worktree.branch };
    await adapters.writeManifest("running", states);
  }

  for (let index = 0; index < common.length; index += 1) {
    const { project, options: setupOptions } = common[index]!;
    const worktree = worktrees[index]!;
    try {
      await adapters.runSetupSession([{ project, phase: "worktree", options: { ...setupOptions, worktreePath: worktree.path } }]);
    } catch (error) {
      await failSession(project.name, "worktree", error);
    }
    states[project.name] = { ...states[project.name], status: "setup-complete", path: worktree.path, branch: worktree.branch };
    await adapters.writeManifest("running", states);
  }

  for (let index = 0; index < worktrees.length; index += 1) {
    const project = options.selected[index]!;
    const worktree = worktrees[index]!;
    try {
      await adapters.verifyProject(worktree.path, options.run);
      const optionalFailures = await adapters.runCommands([...project.verification, ...project.workflows], {
        project,
        worktreePath: worktree.path,
        options: common[index]!.options,
        run: options.run,
      });
      if (optionalFailures.length > 0) {
        states[project.name] = { ...states[project.name], optionalFailures: optionalFailures.map(({ error }) => String(error)) };
        await adapters.writeManifest("running", states);
      }
    } catch (error) {
      await failSession(project.name, "verification", error);
    }
    await adapters.recordEvent(eventOptions, { type: "verification-complete", project: project.name, path: worktree.path });
    states[project.name] = {
      ...states[project.name],
      status: "verified",
      path: worktree.path,
      branch: worktree.branch,
      ...(states[project.name]?.optionalFailures ? { optionalFailures: states[project.name].optionalFailures } : {}),
    };
    await adapters.writeManifest("running", states);
  }

  await adapters.writeManifest("complete", states);
  return { states, worktrees };
}
