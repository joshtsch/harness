import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { loadProjectsConfig } from "./project-config.js";

const executeFile = promisify(execFile);

export type ProjectVisibility = "public" | "private";
export type RemoteProtocol = "ssh" | "https";

export interface ProjectCreationCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type ProjectCreationCommandRunner = (command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }) => Promise<ProjectCreationCommandResult>;

export interface CreateProjectOptions {
  harnessRoot: string;
  name: string;
  visibility?: ProjectVisibility;
  remoteProtocol?: RemoteProtocol;
  dryRun?: boolean;
  resume?: boolean;
  run?: ProjectCreationCommandRunner;
}

export interface CreateProjectResult {
  status: "dry-run" | "complete";
  projectPath: string;
  remote: string;
  statePath: string;
}

interface CreationState {
  name: string;
  owner: string;
  visibility: ProjectVisibility;
  remoteProtocol: RemoteProtocol;
  remote: string;
  localInitialized?: boolean;
  setupVerified?: boolean;
  remoteCreationStarted?: boolean;
  remoteCreated?: boolean;
  remoteAdded?: boolean;
  pushed?: boolean;
  configured?: boolean;
  complete?: boolean;
}

function defaultRun(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<ProjectCreationCommandResult> {
  return executeFile(command, args, options)
    .then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }))
    .catch((error: unknown) => ({
      code: typeof error === "object" && error !== null && "code" in error && typeof error.code === "number" ? error.code : 1,
      stdout: typeof error === "object" && error !== null && "stdout" in error && typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string" ? error.stderr : String(error),
    }));
}

function assertName(name: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error("project name must use lowercase kebab-case");
}

function assertVisibility(visibility: ProjectVisibility | undefined): asserts visibility is ProjectVisibility {
  if (visibility !== "public" && visibility !== "private") throw new Error("exactly one visibility flag is required: --public or --private");
}

function assertProtocol(protocol: RemoteProtocol | undefined): asserts protocol is RemoteProtocol {
  if (protocol !== undefined && protocol !== "ssh" && protocol !== "https") throw new Error("remote protocol must be ssh or https");
}

function remoteUrl(owner: string, name: string, protocol: RemoteProtocol): string {
  return protocol === "ssh" ? `git@github.com:${owner}/${name}.git` : `https://github.com/${owner}/${name}.git`;
}

function isMissingRepository(result: ProjectCreationCommandResult): boolean {
  return /\b404\b|not found/i.test(`${result.stdout}\n${result.stderr}`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function writeState(directory: string, state: CreationState): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "state.json"), JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function readState(directory: string): Promise<CreationState> {
  return JSON.parse(await readFile(join(directory, "state.json"), "utf8")) as CreationState;
}

async function runChecked(run: ProjectCreationCommandRunner, command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<void> {
  const result = await run(command, args, options);
  if (result.code !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`.trim());
}

async function validateRepository(run: ProjectCreationCommandRunner, owner: string, name: string): Promise<void> {
  const result = await run("gh", ["api", `repos/${owner}/${name}`, "--include"]);
  if (result.code === 0) throw new Error(`GitHub repository ${owner}/${name} already exists`);
  if (!isMissingRepository(result)) throw new Error(`could not verify GitHub repository availability: ${result.stderr || result.stdout}`.trim());
}

async function repositoryExists(run: ProjectCreationCommandRunner, owner: string, name: string): Promise<boolean> {
  const result = await run("gh", ["api", `repos/${owner}/${name}`, "--include"]);
  if (result.code === 0) return true;
  if (isMissingRepository(result)) return false;
  throw new Error(`could not verify GitHub repository: ${result.stderr || result.stdout}`.trim());
}

async function configuredProtocol(run: ProjectCreationCommandRunner): Promise<RemoteProtocol> {
  const result = await run("gh", ["config", "get", "git_protocol"]);
  if (result.code !== 0) throw new Error(`could not read GitHub remote protocol: ${result.stderr || result.stdout}`.trim());
  const protocol = result.stdout.trim();
  if (protocol !== "ssh" && protocol !== "https") throw new Error("GitHub remote protocol must be ssh or https");
  return protocol;
}

function projectFiles(name: string): { readme: string; gitignore: string; setup: string } {
  return {
    readme: `# ${name}\n`,
    gitignore: ".DS_Store\n.env\n.env.*\n!.env.example\n",
    setup: `#!/usr/bin/env bash\nset -euo pipefail\n\nphase=\"\${1:-}\"\ncase \"$phase\" in\n  bootstrap|worktree) ;;\n  *) echo \"Usage: scripts/setup.sh <bootstrap|worktree>\" >&2; exit 2 ;;\nesac\n\n: \"\${HARNESS_PROJECT_NAME:?HARNESS_PROJECT_NAME is required}\"\n: \"\${HARNESS_ROOT:?HARNESS_ROOT is required}\"\nprintf 'setup: %s (%s)\\n' \"$HARNESS_PROJECT_NAME\" \"$phase\"\n`,
  };
}

function configEntry(name: string, owner: string, remote: string): string {
  return `  ${name}:\n    remote: ${remote}\n    issue_tracker:\n      repository: ${owner}/${name}\n`;
}

async function appendProjectConfig(configPath: string, name: string, owner: string, remote: string): Promise<void> {
  const content = await readFile(configPath, "utf8");
  const next = content.replace(/\s*$/, "\n") + configEntry(name, owner, remote);
  await validateProjectConfig(configPath, next, name);
  await writeFile(configPath, next, "utf8");
}

async function validateProjectConfig(configPath: string, content: string, name: string): Promise<void> {
  const temporaryPath = `${configPath}.project-creation-check`;
  await writeFile(temporaryPath, content, "utf8");
  try {
    const parsed = await loadProjectsConfig(temporaryPath);
    if (!parsed[name]) throw new Error(`generated configuration is missing projects.${name}`);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function createProject(options: CreateProjectOptions): Promise<CreateProjectResult> {
  assertName(options.name);
  assertVisibility(options.visibility);
  assertProtocol(options.remoteProtocol);
  const run = options.run ?? defaultRun;
  const projectPath = join(options.harnessRoot, "projects", options.name);
  const stateDirectory = join(options.harnessRoot, "docs", ".scratch", "project-creation", options.name);
  const statePath = join(stateDirectory, "state.json");
  const configPath = join(options.harnessRoot, "projects.yml");
  const stateExists = await exists(statePath);
  if (stateExists && !options.resume) throw new Error(`project creation state exists; use --resume for ${options.name}`);
  let state: CreationState | undefined = stateExists ? await readState(stateDirectory) : undefined;
  const resuming = stateExists;
  const protocol = options.remoteProtocol ?? state?.remoteProtocol ?? await configuredProtocol(run);
  const config = await loadProjectsConfig(configPath);
  if (config[options.name] && !state?.configured) throw new Error(`project ${options.name} is already configured`);
  if (!state && await exists(projectPath)) throw new Error(`project path already exists: ${projectPath}`);

  const ownerResult = await run("gh", ["api", "user", "--jq", ".login"]);
  if (ownerResult.code !== 0) throw new Error(`GitHub authentication failed: ${ownerResult.stderr || ownerResult.stdout}`.trim());
  const owner = ownerResult.stdout.trim();
  if (!owner) throw new Error("GitHub authentication returned no user");
  if (!/^[A-Za-z0-9-]+$/.test(owner)) throw new Error("GitHub authentication returned an invalid user");
  const remote = remoteUrl(owner, options.name, protocol);
  if (state) {
    if (state.owner !== owner || state.visibility !== options.visibility || state.remoteProtocol !== protocol) throw new Error("resume options do not match saved project creation state");
    if (state.complete) return { status: "complete", projectPath, remote: state.remote, statePath };
    if (!state.remoteCreated) await validateRepository(run, owner, options.name);
  } else {
    await validateRepository(run, owner, options.name);
    state = { name: options.name, owner, visibility: options.visibility, remoteProtocol: protocol, remote };
  }
  if (state && config[options.name] && !state.configured) {
    if (config[options.name].remote !== remote || config[options.name].issueTracker.repository !== `${owner}/${options.name}`) {
      throw new Error(`project ${options.name} is already configured with different values`);
    }
    state.configured = true;
  }
  if (!state.configured) {
    const generatedConfig = (await readFile(configPath, "utf8")).replace(/\s*$/, "\n") + configEntry(options.name, owner, remote);
    await validateProjectConfig(configPath, generatedConfig, options.name);
  }
  if (options.dryRun) return { status: "dry-run", projectPath, remote, statePath };

  await writeState(stateDirectory, state);
  if (!state.localInitialized) {
    const files = projectFiles(options.name);
    await mkdir(join(projectPath, "scripts"), { recursive: true });
    await writeFile(join(projectPath, "README.md"), files.readme, "utf8");
    await writeFile(join(projectPath, ".gitignore"), files.gitignore, "utf8");
    await writeFile(join(projectPath, "scripts", "setup.sh"), files.setup, "utf8");
    await chmod(join(projectPath, "scripts", "setup.sh"), 0o755);
    await runChecked(run, "git", ["-C", projectPath, "init", "--initial-branch", "main"]);
    await runChecked(run, "git", ["-C", projectPath, "add", "README.md", ".gitignore", "scripts/setup.sh"]);
    await runChecked(run, "git", ["-C", projectPath, "commit", "-m", "chore: initialize project"]);
    state.localInitialized = true;
    await writeState(stateDirectory, state);
  }
  if (!state.setupVerified) {
    await runChecked(run, "bash", [join(projectPath, "scripts/setup.sh"), "bootstrap"], { cwd: projectPath, env: { ...process.env, HARNESS_PROJECT_NAME: options.name, HARNESS_ROOT: options.harnessRoot } });
    const status = await run("git", ["-C", projectPath, "status", "--porcelain"]);
    if (status.code !== 0 || status.stdout.trim() !== "") throw new Error(`generated project is not clean: ${status.stderr || status.stdout}`.trim());
    state.setupVerified = true;
    await writeState(stateDirectory, state);
  }
  if (!state.remoteCreated) {
    state.remoteCreationStarted = true;
    await writeState(stateDirectory, state);
    if (resuming && await repositoryExists(run, owner, options.name)) {
      state.remoteCreated = true;
    } else {
      await runChecked(run, "gh", ["repo", "create", `${owner}/${options.name}`, `--${options.visibility}`]);
      state.remoteCreated = true;
    }
    await writeState(stateDirectory, state);
  }
  if (!state.remoteAdded) {
    await runChecked(run, "git", ["-C", projectPath, "remote", "add", "origin", remote]);
    state.remoteAdded = true;
    await writeState(stateDirectory, state);
  }
  if (!state.pushed) {
    await runChecked(run, "git", ["-C", projectPath, "push", "--set-upstream", "origin", "main"]);
    state.pushed = true;
    await writeState(stateDirectory, state);
  }
  if (!state.configured) {
    await appendProjectConfig(configPath, options.name, owner, remote);
    state.configured = true;
    await writeState(stateDirectory, state);
  }
  state.complete = true;
  await writeState(stateDirectory, state);
  return { status: "complete", projectPath, remote, statePath };
}
