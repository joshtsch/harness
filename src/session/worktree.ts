import { mkdir, stat as defaultStat } from "node:fs/promises";
import { join } from "node:path";

export interface WorktreeProject {
  name: string;
  path: string;
  defaultBranch: string;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

interface WorktreeOptions {
  worktreesDirectory: string;
  issueKey: string;
  ticketTitle: string;
  attempt?: number;
  refresh?: boolean;
  onRefresh?: () => Promise<void>;
  run: CommandRunner;
  stat?: (path: string) => Promise<unknown>;
  mkdir?: (path: string, options: { recursive: true }) => Promise<unknown>;
}

export interface WorktreeResult {
  action: "created" | "existing";
  branch: string;
  name: string;
  path: string;
}

function slug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "work";
}

function worktreeName(issueKey: string, ticketTitle: string, attempt?: number): string {
  const base = `${slug(issueKey)}-${slug(ticketTitle)}`.slice(0, 72).replace(/-+$/g, "");
  return attempt && attempt > 1 ? `${base}-attempt-${attempt}` : base;
}

async function verifyDefaultBranch(project: WorktreeProject, run: CommandRunner, refresh = false, onRefresh?: () => Promise<void>): Promise<void> {
  const prefix = ["-C", project.path];
  if (refresh) {
    await onRefresh?.();
    const fetch = await run("git", [...prefix, "fetch", "origin", project.defaultBranch]);
    if (fetch.code !== 0) throw new Error(`failed to fetch ${project.defaultBranch}: ${fetch.stderr || fetch.stdout}`);
  }

  const current = await run("git", [...prefix, "symbolic-ref", "--short", "HEAD"]);
  if (current.code !== 0 || current.stdout.trim() !== project.defaultBranch) {
    throw new Error(`default branch ${project.defaultBranch} is not checked out`);
  }

  const status = await run("git", [...prefix, "status", "--porcelain", "--untracked-files=all"]);
  if (status.code !== 0 || status.stdout.trim() !== "") {
    throw new Error(`default branch ${project.defaultBranch} is not clean`);
  }

  const local = await run("git", [...prefix, "rev-parse", project.defaultBranch]);
  const remote = await run("git", [...prefix, "rev-parse", `origin/${project.defaultBranch}`]);
  if (remote.code !== 0) {
    throw new Error(`remote ref origin/${project.defaultBranch} is unavailable; refresh project clone first`);
  }
  if (local.code !== 0 || local.stdout.trim() !== remote.stdout.trim()) {
    throw new Error(`default branch ${project.defaultBranch} is not up to date with origin; refresh project clone first`);
  }
}

export async function createProjectWorktree(project: WorktreeProject, options: WorktreeOptions): Promise<WorktreeResult> {
  await verifyDefaultBranch(project, options.run, options.refresh, options.onRefresh);
  const name = worktreeName(options.issueKey, options.ticketTitle, options.attempt);
  const path = join(options.worktreesDirectory, project.name, name);
  const stat = options.stat ?? defaultStat;
  let exists = true;
  try {
    await stat(path);
  } catch (error: unknown) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error;
    exists = false;
  }

  if (exists) {
    const result = await options.run("git", ["-C", path, "rev-parse", "--show-toplevel"]);
    if (result.code !== 0) throw new Error(`${path} already exists and is not a Git worktree`);
    return { action: "existing", branch: name, name, path };
  }

  const parent = join(options.worktreesDirectory, project.name);
  await (options.mkdir ?? mkdir)(parent, { recursive: true });
  const result = await options.run("git", ["-C", project.path, "worktree", "add", "-b", name, path, project.defaultBranch]);
  if (result.code !== 0) throw new Error(`failed to create worktree ${name}: ${result.stderr || result.stdout}`);
  return { action: "created", branch: name, name, path };
}
