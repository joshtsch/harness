import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject, type ProjectCreationCommandRunner } from "../project-creation.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function harnessFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-project-creation-"));
  directories.push(root);
  await mkdir(join(root, "projects"), { recursive: true });
  await writeFile(join(root, "projects.yml"), [
    "defaults:",
    "  default_branch: main",
    "  setup_script: scripts/setup.sh",
    "  issue_tracker:",
    "    type: github",
    "projects:",
    "  existing:",
    "    remote: git@github.com:alice/existing.git",
  ].join("\n") + "\n");
  return root;
}

function readOnlyRunner() {
  return vi.fn<ProjectCreationCommandRunner>(async (command, args) => {
    if (command === "gh" && args.join(" ") === "api user --jq .login") return { code: 0, stdout: "alice\n", stderr: "" };
    if (command === "gh" && args.join(" ") === "config get git_protocol") return { code: 0, stdout: "ssh\n", stderr: "" };
    if (command === "gh" && args[0] === "api" && args[1]?.startsWith("repos/")) return { code: 1, stdout: "", stderr: "HTTP 404: Not Found" };
    throw new Error("unexpected external command");
  });
}

const input = { name: "new-project", visibility: "private" as const, dryRun: true };

describe("createProject", () => {
  it.each([{}, { dryRun: false }, { resume: true }, { dryRun: true, resume: true }])("blocks unsafe execution before any filesystem or external work: %o", async (mode) => {
    const root = await harnessFixture();
    const config = await readFile(join(root, "projects.yml"), "utf8");
    const before = await readdir(root, { recursive: true });
    const run = readOnlyRunner();
    await expect(createProject({ harnessRoot: root, name: "blocked-project", visibility: "private", ...mode, run })).rejects.toThrow("disabled");
    expect(run).not.toHaveBeenCalled();
    expect(await readFile(join(root, "projects.yml"), "utf8")).toBe(config);
    expect(await readdir(root, { recursive: true })).toEqual(before);
  });

  it("preserves existing checkout, local overlay and completed recovery state on resume", async () => {
    const root = await harnessFixture();
    const project = join(root, "projects", input.name);
    const recovery = join(root, "docs", ".scratch", "project-creation", input.name);
    await mkdir(project, { recursive: true });
    await mkdir(recovery, { recursive: true });
    await writeFile(join(project, "uncommitted.txt"), "preserve checkout\n");
    const saved = JSON.stringify({ name: input.name, owner: "alice", complete: true, pushed: true });
    await writeFile(join(recovery, "state.json"), saved);
    const overlay = "projects: {}\n";
    await writeFile(join(root, "projects.local.yml"), overlay);
    const run = readOnlyRunner();
    await expect(createProject({ ...input, harnessRoot: root, resume: true, run })).rejects.toThrow("disabled");
    expect(run).not.toHaveBeenCalled();
    expect(await readFile(join(project, "uncommitted.txt"), "utf8")).toBe("preserve checkout\n");
    expect(await readFile(join(recovery, "state.json"), "utf8")).toBe(saved);
    expect(await readFile(join(root, "projects.local.yml"), "utf8")).toBe(overlay);
  });

  it("validates fresh dry-run names, visibility and protocol before external commands", async () => {
    const root = await harnessFixture();
    const run = readOnlyRunner();
    await expect(createProject({ ...input, harnessRoot: root, name: "Bad Name", run })).rejects.toThrow("lowercase kebab-case");
    await expect(createProject({ ...input, harnessRoot: root, visibility: undefined, run })).rejects.toThrow("exactly one visibility");
    expect(run).not.toHaveBeenCalled();
  });

  it("dry-runs read-only validation without creating or changing local files", async () => {
    const root = await harnessFixture();
    const config = await readFile(join(root, "projects.yml"), "utf8");
    const before = await readdir(root, { recursive: true });
    const run = readOnlyRunner();
    const result = await createProject({ ...input, harnessRoot: root, run });
    expect(result).toEqual({ status: "dry-run", projectPath: join(root, "projects", input.name), remote: "git@github.com:alice/new-project.git", statePath: join(root, "docs", ".scratch", "project-creation", input.name, "state.json") });
    expect(run.mock.calls.map(([command, args]) => `${command} ${args.join(" ")}`)).toEqual(["gh config get git_protocol", "gh api user --jq .login", "gh api repos/alice/new-project --include"]);
    expect(await readFile(join(root, "projects.yml"), "utf8")).toBe(config);
    expect(await readdir(root, { recursive: true })).toEqual(before);
    await expect(stat(result.projectPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves explicit HTTPS remote selection without querying GitHub protocol", async () => {
    const root = await harnessFixture();
    const run = readOnlyRunner();
    const result = await createProject({ ...input, harnessRoot: root, remoteProtocol: "https", run });
    expect(result.remote).toBe("https://github.com/alice/new-project.git");
    expect(run.mock.calls.some(([, args]) => args[0] === "config")).toBe(false);
  });

  it("validates merged configuration before checking remote availability", async () => {
    const root = await harnessFixture();
    await writeFile(join(root, "projects.local.yml"), "projects:\n  new-project:\n    remote: git@github.com:alice/new-project.git\n");
    const run = readOnlyRunner();
    await expect(createProject({ ...input, harnessRoot: root, remoteProtocol: "ssh", run })).rejects.toThrow("already configured");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects invalid local configuration without changing it", async () => {
    const root = await harnessFixture();
    const overlay = "unknown_field: invalid\n";
    await writeFile(join(root, "projects.local.yml"), overlay);
    const run = readOnlyRunner();
    await expect(createProject({ ...input, harnessRoot: root, remoteProtocol: "ssh", run })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(await readFile(join(root, "projects.local.yml"), "utf8")).toBe(overlay);
  });

  it("rejects an existing checkout without touching it", async () => {
    const root = await harnessFixture();
    await mkdir(join(root, "projects", input.name));
    const run = readOnlyRunner();
    await expect(createProject({ ...input, harnessRoot: root, remoteProtocol: "ssh", run })).rejects.toThrow("project path already exists");
    expect(run).not.toHaveBeenCalled();
  });

  it("preserves unreadable legacy recovery contents and directs dry-run callers to intake", async () => {
    const root = await harnessFixture();
    const recovery = join(root, "docs", ".scratch", "project-creation", input.name);
    await mkdir(recovery, { recursive: true });
    await writeFile(join(recovery, "state.json"), "partial legacy state");
    const run = readOnlyRunner();
    await expect(createProject({ ...input, harnessRoot: root, run })).rejects.toThrow("docs/agents/repository-intake.md");
    expect(run).not.toHaveBeenCalled();
    expect(await readFile(join(recovery, "state.json"), "utf8")).toBe("partial legacy state");
  });

  it.each([0, 500])("rejects existing repositories and non-404 availability failures: %s", async (status) => {
    const root = await harnessFixture();
    const run: ProjectCreationCommandRunner = async (_command, args) => args[1] === "user"
      ? { code: 0, stdout: "alice\n", stderr: "" }
      : { code: status === 0 ? 0 : 1, stdout: "", stderr: status === 0 ? "" : "HTTP 500" };
    await expect(createProject({ ...input, harnessRoot: root, remoteProtocol: "ssh", run })).rejects.toThrow(status === 0 ? "already exists" : "could not verify");
  });

  it.each([{ flags: [] }, { flags: ["--resume"] }, { flags: ["--dry-run", "--resume"] }])("CLI rejects unsafe execution without GitHub access: $flags", async ({ flags }) => {
    const root = await harnessFixture();
    const script = fileURLToPath(new URL("../../scripts/create-project.ts", import.meta.url));
    const before = await readdir(root, { recursive: true });
    const result = spawnSync(process.execPath, ["--import", createRequire(import.meta.url).resolve("tsx"), script, input.name, "--private", ...flags], { cwd: root, encoding: "utf8", env: { ...process.env, PATH: "" } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("disabled");
    expect(result.stderr).toContain("docs/agents/repository-intake.md");
    expect(result.stdout).toBe("");
    expect(await readdir(root, { recursive: true })).toEqual(before);
  });
});
