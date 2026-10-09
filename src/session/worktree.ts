import { mkdir, realpath as defaultRealpath, stat as defaultStat } from "node:fs/promises";
import { join, resolve } from "node:path";

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
  branch?: string;
  base?: string;
  refresh?: boolean;
  onRefresh?: () => Promise<void>;
  run: CommandRunner;
  stat?: (path: string) => Promise<unknown>;
  mkdir?: (path: string, options: { recursive: true }) => Promise<unknown>;
  realpath?: (path: string) => Promise<string>;
}

export interface WorktreeResult {
  action: "created" | "existing";
  branch: string;
  name: string;
  path: string;
  base: string;
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
    const fetch = await run("git", [...prefix, "fetch", "--prune", "origin"]);
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

async function hasRef(projectPath: string, ref: string, run: CommandRunner): Promise<boolean> {
  const result = await run("git", ["-C", projectPath, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  throw new Error(`failed to inspect ref ${ref}: ${result.stderr || result.stdout}`);
}

export async function readWorktreeBase(projectPath: string, branch: string, run: CommandRunner): Promise<string | undefined> {
  const result = await run("git", ["-C", projectPath, "config", "--get", `branch.${branch}.harness-base`]);
  if (result.code === 1) return undefined;
  if (result.code !== 0 || !result.stdout.trim().startsWith("origin/")) throw new Error(`invalid or unreadable recorded base for ${branch}`);
  const base = result.stdout.trim();
  const valid = await run("git", ["check-ref-format", "--branch", base.slice("origin/".length)]);
  if (valid.code !== 0) throw new Error(`invalid recorded base for ${branch}`);
  if (!await hasRef(projectPath, `refs/remotes/${base}`, run)) throw new Error(`recorded base ${base} is unavailable on origin; do not fall back to the default branch`);
  return base;
}

export async function createProjectWorktree(project: WorktreeProject, options: WorktreeOptions): Promise<WorktreeResult> {
  const name = worktreeName(options.issueKey, options.ticketTitle, options.attempt);
  const branch = options.branch ?? name;
  const baseBranch = options.base?.replace(/^origin\//, "") ?? project.defaultBranch;
  for (const value of [branch, baseBranch]) {
    const valid = await options.run("git", ["check-ref-format", "--branch", value]);
    if (valid.code !== 0 || value.startsWith("-") || value.includes("@{")) throw new Error(`invalid branch name: ${value}`);
  }
  if (branch === baseBranch) throw new Error("worktree branch must differ from its base");
  if (branch === project.defaultBranch) throw new Error("worktree branch must not be the default branch");
  await verifyDefaultBranch(project, options.run, options.refresh, options.onRefresh);
  const recordedBase = await readWorktreeBase(project.path, branch, options.run);
  if (recordedBase && options.base && recordedBase !== `origin/${baseBranch}`) throw new Error(`requested base conflicts with recorded base ${recordedBase}`);
  const base = recordedBase ?? `origin/${baseBranch}`;
  if (base === `origin/${branch}`) throw new Error("worktree branch must differ from its recorded base");
  if (!await hasRef(project.path, `refs/remotes/${base}`, options.run)) throw new Error(`base ${base} is unavailable on origin`);
  const path = join(options.worktreesDirectory, project.name, name);
  const stat = options.stat ?? defaultStat;
  let exists = true;
  try {
    await stat(path);
  } catch (error: unknown) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error;
    exists = false;
  }

  const localExists = await hasRef(project.path, `refs/heads/${branch}`, options.run);
  const remoteExists = await hasRef(project.path, `refs/remotes/origin/${branch}`, options.run);
  if (exists) {
    const result = await options.run("git", ["-C", path, "rev-parse", "--show-toplevel"]);
    const current = await options.run("git", ["-C", path, "symbolic-ref", "--short", "HEAD"]);
    const source = await options.run("git", ["-C", project.path, "rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const common = await options.run("git", ["-C", path, "rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (result.code !== 0 || !result.stdout.trim() || current.code !== 0 || current.stdout.trim() !== branch || source.code !== 0 || !source.stdout.trim() || common.code !== 0 || !common.stdout.trim()) {
      throw new Error(`${path} already exists but is not the requested worktree for ${branch}`);
    }
    const realpath = options.realpath ?? defaultRealpath;
    if (await realpath(resolve(result.stdout.trim())) !== await realpath(path) || await realpath(source.stdout.trim()) !== await realpath(common.stdout.trim())) {
      throw new Error(`${path} already exists but is not the requested worktree for ${branch}`);
    }
  }
  if (remoteExists) {
    if (!localExists) {
      const track = await options.run("git", ["-C", project.path, "branch", "--track", branch, `origin/${branch}`]);
      if (track.code !== 0) throw new Error(`failed to track origin/${branch}: ${track.stderr || track.stdout}`);
    } else {
      const upstream = await options.run("git", ["-C", project.path, "for-each-ref", "--format=%(upstream)", `refs/heads/${branch}`]);
      if (upstream.code !== 0) throw new Error(`failed to inspect upstream for ${branch}`);
      if (upstream.stdout.trim() && upstream.stdout.trim() !== `refs/remotes/origin/${branch}`) throw new Error(`branch ${branch} tracks a different upstream`);
      if (!upstream.stdout.trim()) {
        const track = await options.run("git", ["-C", project.path, "branch", `--set-upstream-to=origin/${branch}`, branch]);
        if (track.code !== 0) throw new Error(`failed to track origin/${branch}: ${track.stderr || track.stdout}`);
      }
    }
  }
  if (!exists) {
    const parent = join(options.worktreesDirectory, project.name);
    await (options.mkdir ?? mkdir)(parent, { recursive: true });
    const args = localExists || remoteExists ? [path, branch] : ["-b", branch, path, base];
    const result = await options.run("git", ["-C", project.path, "worktree", "add", ...args]);
    if (result.code !== 0) throw new Error(`failed to create worktree ${name}: ${result.stderr || result.stdout}`);
  }
  const record = await options.run("git", ["-C", project.path, "config", `branch.${branch}.harness-base`, base]);
  if (record.code !== 0) throw new Error(`failed to record base for ${branch}: ${record.stderr || record.stdout}`);
  return { action: exists ? "existing" : "created", branch, name, path, base };
}
