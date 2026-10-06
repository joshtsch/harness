import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProjectDefinition, WorkflowCommand } from "../project-config.js";

const executeFile = promisify(execFile);

export type SetupPhase = "bootstrap" | "worktree";

export interface SetupCommandOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface SetupCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type SetupCommandRunner = (command: string, args: string[], options: SetupCommandOptions) => Promise<SetupCommandResult>;

export async function recordSetupEvent(options: Pick<ProjectSetupOptions, "logDirectory" | "sessionId">, event: Record<string, unknown>): Promise<void> {
  const directory = join(options.logDirectory, options.sessionId);
  await mkdir(directory, { recursive: true });
  await appendFile(join(directory, "session.events.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n", "utf8");
}

export interface ProjectSetupOptions {
  projectRoot: string;
  worktreePath?: string;
  issueKey: string;
  purpose: string;
  harnessRoot: string;
  sessionId: string;
  logDirectory: string;
  run?: SetupCommandRunner;
}

export interface SetupResult {
  phase: SetupPhase;
  logPath: string;
  code: number;
}

export interface SetupFailure {
  phase: SetupPhase;
  error: Error;
}

export interface SetupStep {
  project: ProjectDefinition;
  phase: SetupPhase;
  options: ProjectSetupOptions;
  required?: boolean;
}

export interface SetupSessionResult {
  results: SetupResult[];
  optionalFailures: SetupFailure[];
}

export interface VerificationOptions {
  project: ProjectDefinition;
  worktreePath: string;
  options: ProjectSetupOptions;
  run?: SetupCommandRunner;
}

function defaultRun(command: string, args: string[], options: SetupCommandOptions): Promise<SetupCommandResult> {
  return executeFile(command, args, options)
    .then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }))
    .catch((error: unknown) => ({
      code: typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 1,
      stdout: typeof error === "object" && error !== null && "stdout" in error && typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string" ? error.stderr : String(error),
    }));
}

function setupEnvironment(project: ProjectDefinition, options: ProjectSetupOptions): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HARNESS_ROOT: options.harnessRoot,
    HARNESS_PROJECT_NAME: project.name,
    HARNESS_ISSUE_KEY: options.issueKey,
    HARNESS_PURPOSE: options.purpose,
    HARNESS_WORKTREE_PATH: options.worktreePath ?? "",
    HARNESS_SESSION_ID: options.sessionId,
  };
}

async function phaseAlreadyComplete(statePath: string): Promise<boolean> {
  try {
    const entries = (await readFile(statePath, "utf8")).trim().split("\n").filter(Boolean);
    return entries.length > 0 && JSON.parse(entries.at(-1)!).status === "complete";
  } catch {
    return false;
  }
}

export async function runProjectSetup(project: ProjectDefinition, phase: SetupPhase, options: ProjectSetupOptions): Promise<SetupResult> {
  if (phase === "worktree" && !options.worktreePath) throw new Error("worktree setup requires a worktree path");
  const cwd = phase === "bootstrap" ? options.projectRoot : options.worktreePath!;
  const logPath = join(options.logDirectory, options.sessionId, `${project.name}-${phase}.log`);
  const statePath = join(options.logDirectory, options.sessionId, `${project.name}-${phase}.state.json`);
  const run = options.run ?? defaultRun;
  await mkdir(join(options.logDirectory, options.sessionId), { recursive: true });
  if (await phaseAlreadyComplete(statePath)) return { phase, logPath, code: 0 };
  await appendFile(statePath, JSON.stringify({ project: project.name, phase, status: "running" }) + "\n", "utf8");
  const result = await run("bash", [join(cwd, project.setupScript), phase], { cwd, env: setupEnvironment(project, options) });
  await appendFile(logPath, `phase=${phase}\nexit=${result.code}\n${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ""}\n`, "utf8");
  if (result.code !== 0) {
    await appendFile(statePath, JSON.stringify({ project: project.name, phase, status: "failed", code: result.code, logPath }) + "\n", "utf8");
    throw new Error(`${project.name} ${phase} setup failed; see ${logPath}`);
  }
  await appendFile(statePath, JSON.stringify({ project: project.name, phase, status: "complete", logPath }) + "\n", "utf8");
  return { phase, logPath, code: result.code };
}

export async function runProjectSetupSession(steps: SetupStep[]): Promise<SetupSessionResult> {
  const results: SetupResult[] = [];
  const optionalFailures: SetupFailure[] = [];
  for (const step of steps) {
    await recordSetupEvent(step.options, { type: "setup-start", project: step.project.name, phase: step.phase });
    try {
      results.push(await runProjectSetup(step.project, step.phase, step.options));
      await recordSetupEvent(step.options, { type: "setup-complete", project: step.project.name, phase: step.phase });
    } catch (error: unknown) {
      await recordSetupEvent(step.options, { type: "setup-failed", project: step.project.name, phase: step.phase, error: String(error) });
      if (step.required !== false) throw error;
      optionalFailures.push({ phase: step.phase, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }
  return { results, optionalFailures };
}

export async function verifyProjectReady(worktreePath: string, run: SetupCommandRunner = defaultRun): Promise<void> {
  const result = await run("git", ["-C", worktreePath, "status", "--porcelain", "--untracked-files=all"], { cwd: worktreePath, env: process.env });
  if (result.code !== 0) throw new Error(`worktree verification failed: ${result.stderr || result.stdout}`);
  if (result.stdout.trim() !== "") throw new Error("worktree verification failed: worktree is not clean");
}

export async function runProjectCommands(commands: WorkflowCommand[], options: VerificationOptions): Promise<SetupFailure[]> {
  const failures: SetupFailure[] = [];
  const run = options.run ?? defaultRun;
  const directory = join(options.options.logDirectory, options.options.sessionId);
  await mkdir(directory, { recursive: true });
  for (const [index, command] of commands.entries()) {
    const logPath = join(directory, `${options.project.name}-workflow-${index + 1}.log`);
    const result = await run(command.command, command.args, { cwd: options.worktreePath, env: setupEnvironment(options.project, { ...options.options, worktreePath: options.worktreePath }) });
    await appendFile(logPath, `command=${command.command} ${command.args.join(" ")}\nexit=${result.code}\n${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ""}\n`, "utf8");
    if (result.code === 0) continue;
    const failure = { phase: "verification" as SetupPhase, error: new Error(`${options.project.name} command failed; see ${logPath}`) };
    await recordSetupEvent(options.options, { type: command.required ? "verification-failed" : "workflow-failed", project: options.project.name, command: command.command, args: command.args, logPath, error: result.stderr || result.stdout });
    if (command.required) throw failure.error;
    failures.push(failure);
  }
  return failures;
}
