import { mkdir, stat as defaultStat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { ProjectDefinition } from "../project-config.js";

const executeFile = promisify(execFile);

export type { ProjectDefinition };

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ProjectClone {
  action: "cloned" | "existing";
  path: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

interface FileStats {
  isDirectory?: () => boolean;
}

interface CloneOptions {
  projectsDirectory: string;
  stat?: (path: string) => Promise<FileStats>;
  mkdir?: (path: string, options: { recursive: true }) => Promise<unknown>;
  run?: CommandRunner;
}

function defaultRun(command: string, args: string[]): Promise<CommandResult> {
  return executeFile(command, args)
    .then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }))
    .catch((error: unknown) => ({
      code: typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 1,
      stdout: typeof error === "object" && error !== null && "stdout" in error && typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string" ? error.stderr : String(error),
    }));
}

export async function inspectProjectClone(project: ProjectDefinition, options: CloneOptions): Promise<ProjectClone | null> {
  const projectPath = join(options.projectsDirectory, project.name);
  const stat = options.stat ?? defaultStat;
  const run = options.run ?? defaultRun;
  let exists = true;
  try {
    await stat(projectPath);
  } catch (error: unknown) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error;
    exists = false;
  }

  if (exists) {
    const result = await run("git", ["-C", projectPath, "rev-parse", "--is-inside-work-tree", "--show-prefix"]);
    if (result.code !== 0 || result.stdout.trim() !== "true") throw new Error(`${projectPath} already exists and is not a Git repository root`);
    return { action: "existing", path: projectPath };
  }
  return null;
}

export async function ensureProjectClone(project: ProjectDefinition, options: CloneOptions): Promise<ProjectClone> {
  const existing = await inspectProjectClone(project, options);
  if (existing) return existing;
  const projectPath = join(options.projectsDirectory, project.name);
  const run = options.run ?? defaultRun;
  await (options.mkdir ?? mkdir)(options.projectsDirectory, { recursive: true });
  const result = await run("git", ["clone", project.remote, projectPath]);
  if (result.code !== 0) throw new Error(`failed to clone ${project.name}: ${result.stderr || result.stdout}`);
  return { action: "cloned", path: projectPath };
}
