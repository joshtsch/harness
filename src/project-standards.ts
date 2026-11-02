import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify } from "yaml";
import { requireProjectQuality, type ProjectDefinition, type WorkflowCommand } from "./project-config.js";
import { findSensitiveContent } from "./sensitive-content.js";
import type { SetupCommandRunner } from "./session/project-setup.js";

const execute = promisify(execFile);
export const standardsWorkflowPath = ".github/workflows/standards.yml";
export const standardsCheckName = "Project standards";

export const runStandardsCommand: SetupCommandRunner = async (command, args, options) => {
  try {
    const { stdout, stderr } = await execute(command, args, { ...options, maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    // Command output can contain credentials. Only status crosses this boundary.
    const code = (error as NodeJS.ErrnoException).code;
    return { code: typeof code === "number" ? code : 1, stdout: "", stderr: code === "ENOENT" ? "executable missing" : "command failed" };
  }
};

function checks(project: ProjectDefinition): WorkflowCommand[] {
  const quality = requireProjectQuality(project);
  return [quality.lint, quality.format, ...project.verification];
}

function shellCommand(command: WorkflowCommand): string {
  if ([command.command, ...command.args].some((value) => value.includes("${{"))) throw new Error("project commands must not contain provider expressions; use environment references inside project-owned scripts");
  return [command.command, ...command.args].map((value) => `'${value.replaceAll("'", "'\\''")}'`).join(" ");
}

// A narrow generated contract makes it possible to verify what CI actually runs.
// Existing custom workflows remain untouched and require separate onboarding.
export function projectStandardsWorkflow(project: ProjectDefinition): string {
  const workflow = stringify({
    name: standardsCheckName,
    on: { push: { branches: [project.defaultBranch] }, pull_request: { branches: [project.defaultBranch] } },
    permissions: { contents: "read" },
    jobs: { standards: {
      name: standardsCheckName,
      "runs-on": "ubuntu-latest",
      env: { HARNESS_ROOT: "${{ github.workspace }}", HARNESS_PROJECT_NAME: project.name },
      steps: [
        { uses: "actions/checkout@v4", with: { "persist-credentials": false } },
        { name: "Project setup", run: shellCommand({ command: "bash", args: [project.setupScript, "bootstrap"], required: true }) },
        ...checks(project).map((command, index) => ({ name: `Check ${index + 1}`, run: shellCommand(command), ...(command.required ? {} : { "continue-on-error": true }) })),
      ],
    } },
  });
  if (findSensitiveContent(workflow.split("\n").map((line) => `+${line}`).join("\n")).length) throw new Error("workflow contains likely sensitive content; use project-owned scripts and environment references");
  return workflow;
}

const scaffoldFiles = new Set([
  "README.md", "LICENSE", ".gitignore", ".gitattributes", ".editorconfig", ".env.example",
  "package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "pnpm-workspace.yaml",
  "pyproject.toml", "uv.lock", "requirements.txt", "ruff.toml", ".ruff.toml",
  "biome.json", "biome.jsonc", "tsconfig.json", ".prettierignore", ".prettierrc", ".prettierrc.json",
  "eslint.config.js", "eslint.config.mjs", "eslint.config.ts", "prettier.config.js", "prettier.config.mjs",
  "scripts/setup.sh", standardsWorkflowPath,
]);

export interface StandardsOptions {
  project: ProjectDefinition;
  path: string;
  bootstrap?: boolean;
  run?: SetupCommandRunner;
}

async function commandOutput(options: StandardsOptions, command: string, args: string[]): Promise<string> {
  const result = await (options.run ?? runStandardsCommand)(command, args, {
    cwd: options.path,
    env: { ...process.env, HARNESS_PROJECT_NAME: options.project.name, HARNESS_ROOT: process.cwd() },
  });
  if (result.code !== 0) throw new Error(`${command === "git" ? "repository check" : "project check"} failed (exit ${result.code}); verify executable, dependencies, and command configuration locally`);
  return result.stdout;
}

async function snapshot(options: StandardsOptions): Promise<string> {
  const paths = (await commandOutput(options, "git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean).sort();
  const hash = createHash("sha256").update(JSON.stringify(options.project));
  for (const path of new Set(paths)) {
    if (options.bootstrap && !scaffoldFiles.has(path) && !/^scripts\/quality\.[a-z]+$/.test(path)) {
      throw new Error("bootstrap contains files outside the setup/quality scaffold; use an issue-bound worktree for feature work");
    }
    const file = join(options.path, path);
    const metadata = await lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!metadata) {
      hash.update(path).update("deleted");
      continue;
    }
    if (!metadata.isFile()) throw new Error("standards validation requires regular files; review symlinks and submodules locally");
    hash.update(path).update(String(metadata.mode)).update(await readFile(file));
  }
  return hash.digest("hex");
}

async function requireBootstrap(options: StandardsOptions): Promise<void> {
  const branch = (await commandOutput(options, "git", ["symbolic-ref", "--short", "HEAD"])).trim();
  if (branch !== options.project.defaultBranch) throw new Error("bootstrap requires the initial integration branch; use normal session setup for feature work");
  const commits = await commandOutput(options, "git", ["rev-list", "--all", "--count"]);
  if (Number(commits.trim()) > 1) throw new Error("bootstrap is limited to the initial scaffold; use normal session setup");
}

export async function validateLocalStandards(options: StandardsOptions): Promise<{ status: "locally-validated"; fingerprint: string; optionalFailures: number; checks: number }> {
  const commands = checks(options.project);
  if (options.bootstrap) await requireBootstrap(options);
  await readFile(join(options.path, options.project.setupScript));
  if (options.bootstrap) await commandOutput(options, "bash", [options.project.setupScript, "bootstrap"]);
  const before = await snapshot(options);
  let optionalFailures = 0;
  for (const [index, command] of commands.entries()) {
    try {
      await commandOutput(options, command.command, command.args);
    } catch {
      if (command.required) throw new Error(`required local check ${index + 1} failed; verify executable, dependencies, and configured command locally`);
      optionalFailures += 1;
    }
  }
  if (await snapshot(options) !== before) throw new Error("checks changed repository content; use non-mutating checks and validate again");
  return { status: "locally-validated", fingerprint: before, optionalFailures, checks: commands.length };
}

export async function publishBootstrap(options: StandardsOptions): Promise<void> {
  options = { ...options, bootstrap: true };
  const head = (await commandOutput(options, "git", ["rev-parse", "--verify", "HEAD"])).trim();
  const validation = await validateLocalStandards(options); // Never consume saved success evidence.
  if ((await commandOutput(options, "git", ["status", "--porcelain", "--untracked-files=all"])).trim()) throw new Error("commit the reviewed scaffold before initial publication");
  const remote = (await commandOutput(options, "git", ["remote", "get-url", "origin"])).trim();
  if (remote !== options.project.remote) throw new Error("origin does not match the registered planned remote");
  const refs = await commandOutput(options, "git", ["ls-remote", "origin"]);
  if (refs.trim()) throw new Error("remote already has refs; bootstrap publication is closed, use normal issue/worktree workflow");
  const diff = await commandOutput(options, "git", ["show", "--format=", "--root", "--binary", "--unified=0", head]);
  if (findSensitiveContent(diff).length) throw new Error("sensitive content detected; inspect the initial commit locally");
  if (await snapshot(options) !== validation.fingerprint) throw new Error("repository changed after validation; validate again");
  await requireBootstrap(options);
  if ((await commandOutput(options, "git", ["rev-parse", "--verify", "HEAD"])).trim() !== head) throw new Error("commit changed after validation; validate again");
  await commandOutput(options, "git", ["push", "origin", `${head}:refs/heads/${options.project.defaultBranch}`]);
}

export interface RemoteStandardsResult {
  status: "remotely-enforced" | "blocked" | "unsupported";
  reason: string;
  nextAction: string;
}

export async function verifyRemoteStandards(project: ProjectDefinition, run: SetupCommandRunner = runStandardsCommand): Promise<RemoteStandardsResult> {
  const repository = project.issueTracker.repository;
  if (project.issueTracker.type !== "github" || !repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    return { status: "unsupported", reason: "only GitHub repository enforcement is supported", nextAction: "select a supported provider onboarding path" };
  }
  if (![ `https://github.com/${repository}.git`, `https://github.com/${repository}`, `git@github.com:${repository}.git` ].includes(project.remote)) {
    return { status: "blocked", reason: "remote and tracker repository identities differ", nextAction: "verify the registered remote and tracker before onboarding" };
  }
  const blocked = (reason: string, nextAction: string): RemoteStandardsResult => ({ status: "blocked", reason, nextAction });
  const api = async (endpoint: string): Promise<any> => {
    const result = await run("gh", ["api", `repos/${repository}/${endpoint}`], { cwd: process.cwd(), env: process.env });
    if (result.code !== 0) throw new Error("provider read failed; verify repository access, Actions read access, and branch-protection read permissions");
    return JSON.parse(result.stdout);
  };
  try {
    const branch = await api(`branches/${encodeURIComponent(project.defaultBranch)}`);
    const sha = branch.commit?.sha;
    if (typeof sha !== "string" || !/^[a-f0-9]{40,64}$/.test(sha)) return blocked("integration branch has no verified commit", "publish the validated initial scaffold");
    const file = await api(`contents/${standardsWorkflowPath}?ref=${sha}`);
    if (file.encoding !== "base64" || Buffer.from(file.content ?? "", "base64").toString("utf8") !== projectStandardsWorkflow(project)) {
      return blocked("remote CI does not match the project-owned check contract", "review and install the generated standards workflow; preserve existing workflows");
    }
    const runs = await api(`actions/workflows/standards.yml/runs?head_sha=${sha}&branch=${encodeURIComponent(project.defaultBranch)}&event=push&per_page=1`);
    const latest = runs.workflow_runs?.[0];
    if (!latest || latest.head_sha !== sha || latest.status !== "completed" || latest.conclusion !== "success") return blocked("CI has not succeeded for the current integration commit", "wait for or repair the integration-branch standards run");
    const jobs = await api(`actions/runs/${latest.id}/jobs?per_page=100`);
    const job = jobs.jobs?.find((entry: any) => entry.name === standardsCheckName);
    if (!job || job.conclusion !== "success" || !checks(project).every((check, index) => !check.required || job.steps?.some((step: any) => step.name === `Check ${index + 1}` && step.conclusion === "success"))) {
      return blocked("required CI steps did not succeed", "repair skipped or failed project checks");
    }
    const protection = await api(`branches/${encodeURIComponent(project.defaultBranch)}/protection`);
    const required = protection.required_status_checks;
    if (!required?.strict || !protection.enforce_admins?.enabled || !required.contexts?.includes(standardsCheckName)) {
      return blocked("integration branch does not enforce the standards check", "complete Terraform coverage/state setup, apply approved protection, then verify again");
    }
    if ((await api(`branches/${encodeURIComponent(project.defaultBranch)}`)).commit?.sha !== sha) return blocked("integration branch changed during verification", "run remote verification again for the new commit");
    return { status: "remotely-enforced", reason: "current integration CI and required branch checks verified", nextAction: "use normal issue-bound session and worktree workflow" };
  } catch {
    return blocked("provider verification unavailable or denied; no enforcement verified", "verify repository/Actions/protection read permissions and service availability; a 404 can mean missing protection or inaccessible resources");
  }
}
