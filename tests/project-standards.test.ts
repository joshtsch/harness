import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";
import { projectStandardsWorkflow, publishBootstrap, standardsCheckName, validateLocalStandards, verifyRemoteStandards } from "../src/project-standards.js";
import type { ProjectDefinition } from "../src/project-config.js";
import type { SetupCommandRunner } from "../src/session/project-setup.js";

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const check = { command: process.execPath, args: ["-e", "process.exit(0)"], required: true };
const project: ProjectDefinition = {
  name: "fixture", remote: "https://github.com/example/fixture.git", defaultBranch: "main", setupScript: "scripts/setup.sh",
  issueTracker: { type: "github", repository: "example/fixture" }, quality: { lint: check, format: check }, verification: [], workflows: [],
};
async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "standards-"));
  roots.push(root);
  await exec("git", ["init", "--initial-branch", "main", root]);
  await exec("git", ["config", "user.name", "Fixture"], { cwd: root });
  await exec("git", ["config", "user.email", "fixture@localhost"], { cwd: root });
  await mkdir(join(root, "scripts"));
  await writeFile(join(root, "scripts/setup.sh"), "#!/bin/sh\nexit 0\n");
  return root;
}
async function commit(root: string): Promise<void> {
  await exec("git", ["add", "."], { cwd: root });
  await exec("git", ["commit", "-m", "scaffold"], { cwd: root });
}

describe("local standards", () => {
  it("validates an unborn registered scaffold without remote or network", async () => {
    const path = await repository();
    await expect(validateLocalStandards({ project, path, bootstrap: true })).resolves.toMatchObject({ status: "locally-validated", checks: 2 });
    expect((await exec("git", ["remote"], { cwd: path })).stdout).toBe("");
  });
  it("fails missing required checks, missing executables, and failing commands", async () => {
    const path = await repository();
    await expect(validateLocalStandards({ project: { ...project, quality: undefined }, path })).rejects.toThrow("lint and format");
    for (const command of [{ ...check, command: "missing-fixture-check" }, { ...check, args: ["-e", "process.exit(3)"] }]) {
      await expect(validateLocalStandards({ project: { ...project, quality: { lint: command, format: check } }, path })).rejects.toThrow("required local check 1 failed");
    }
  });
  it("reruns checks after source/config edits and rejects mutating format checks", async () => {
    const path = await repository();
    const first = await validateLocalStandards({ project, path });
    await writeFile(join(path, "README.md"), "# Changed\n");
    const second = await validateLocalStandards({ project, path });
    expect(second.fingerprint).not.toBe(first.fingerprint);
    const mutate = { ...check, args: ["-e", "require('fs').writeFileSync('README.md','changed again')"] };
    await expect(validateLocalStandards({ project: { ...project, quality: { lint: check, format: mutate } }, path })).rejects.toThrow("non-mutating");
    await expect(validateLocalStandards({ project: { ...project, verification: [{ ...check, args: ["-e", "process.exit(1)"] }] }, path })).rejects.toThrow("check 3 failed");
  });
  it("validates source deletions and detects files deleted by checks", async () => {
    const path = await repository();
    await writeFile(join(path, "README.md"), "# Fixture\n");
    await commit(path);
    const before = await validateLocalStandards({ project, path });
    await rm(join(path, "README.md"));
    const after = await validateLocalStandards({ project, path });
    expect(after.checks).toBe(2);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    await writeFile(join(path, "README.md"), "# Fixture\n");
    const remove = { ...check, args: ["-e", "require('fs').unlinkSync('README.md')"] };
    await expect(validateLocalStandards({ project: { ...project, quality: { lint: check, format: remove } }, path })).rejects.toThrow("non-mutating");
  });
  it("reports optional failures without claiming they passed", async () => {
    const path = await repository();
    await expect(validateLocalStandards({ project: { ...project, verification: [{ ...check, required: false, args: ["-e", "process.exit(1)"] }] }, path })).resolves.toMatchObject({ optionalFailures: 1 });
  });
  it("rejects feature files and later history in the bootstrap exception", async () => {
    const path = await repository();
    await writeFile(join(path, "feature.ts"), "export const feature = true;\n");
    await expect(validateLocalStandards({ project, path, bootstrap: true })).rejects.toThrow("outside the setup/quality scaffold");
    await rm(join(path, "feature.ts"));
    await commit(path);
    await writeFile(join(path, "README.md"), "# Second\n");
    await commit(path);
    await expect(validateLocalStandards({ project, path, bootstrap: true })).rejects.toThrow("initial scaffold");
  });
  it("publishes only a freshly validated initial scaffold to an empty planned remote", async () => {
    const path = await repository();
    const remote = join(path, "..", `${path.split("/").at(-1)}-remote.git`);
    roots.push(remote);
    await exec("git", ["init", "--bare", remote]);
    await exec("git", ["remote", "add", "origin", remote], { cwd: path });
    await commit(path);
    const definition = { ...project, remote };
    await publishBootstrap({ project: definition, path });
    await expect(publishBootstrap({ project: definition, path })).rejects.toThrow("remote already has refs");
    expect((await exec("git", ["ls-remote", remote])).stdout).toContain("refs/heads/main");
  });
  it("blocks publication after a formerly passing command fails, even with hooks disabled", async () => {
    const path = await repository();
    await commit(path);
    await validateLocalStandards({ project, path });
    await exec("git", ["config", "core.hooksPath", "/dev/null"], { cwd: path });
    const failing = { ...project, quality: { lint: { ...check, args: ["-e", "process.exit(1)"] }, format: check } };
    await expect(publishBootstrap({ project: failing, path })).rejects.toThrow("required local check");
  });
});

function provider(overrides: Record<string, unknown> = {}): SetupCommandRunner {
  const sha = "a".repeat(40);
  const responses: Record<string, unknown> = {
    "branches/main": { commit: { sha } },
    [`contents/.github/workflows/standards.yml?ref=${sha}`]: { encoding: "base64", content: Buffer.from(projectStandardsWorkflow(project)).toString("base64") },
    [`actions/workflows/standards.yml/runs?head_sha=${sha}&branch=main&event=push&per_page=1`]: { workflow_runs: [{ id: 12, head_sha: sha, status: "completed", conclusion: "success" }] },
    "actions/runs/12/jobs?per_page=100": { jobs: [{ name: standardsCheckName, conclusion: "success", steps: [{ name: "Check 1", conclusion: "success" }, { name: "Check 2", conclusion: "success" }] }] },
    "branches/main/protection": { required_status_checks: { strict: true, contexts: [standardsCheckName] }, enforce_admins: { enabled: true } },
    ...overrides,
  };
  return vi.fn(async (_command, args) => ({ code: 0, stdout: JSON.stringify(responses[args[1].replace("repos/example/fixture/", "")]), stderr: "" }));
}
describe("remote standards", () => {
  it("preserves logical project identity when the repository name differs", () => {
    const workflow = parse(projectStandardsWorkflow({ ...project, name: "logical-fixture" }));
    expect(workflow.jobs.standards.env.HARNESS_PROJECT_NAME).toBe("logical-fixture");
  });
  it("requires successful current CI, exact project commands, and enforced protection", async () => {
    await expect(verifyRemoteStandards(project, provider())).resolves.toMatchObject({ status: "remotely-enforced" });
    await expect(verifyRemoteStandards(project, provider({ "branches/main/protection": {} }))).resolves.toMatchObject({ status: "blocked" });
    const sha = "a".repeat(40);
    await expect(verifyRemoteStandards(project, provider({ [`contents/.github/workflows/standards.yml?ref=${sha}`]: { encoding: "base64", content: Buffer.from("unverified workflow").toString("base64") } }))).resolves.toMatchObject({ status: "blocked" });
    await expect(verifyRemoteStandards(project, provider({ "actions/runs/12/jobs?per_page=100": { jobs: [] } }))).resolves.toMatchObject({ status: "blocked" });
    await expect(verifyRemoteStandards(project, provider({ [`actions/workflows/standards.yml/runs?head_sha=${sha}&branch=main&event=push&per_page=1`]: { workflow_runs: [] } }))).resolves.toMatchObject({ status: "blocked" });
  });
  it("keeps denied/unavailable and unsupported providers explicit without leaking output", async () => {
    const result = await verifyRemoteStandards(project, async () => ({ code: 1, stdout: "private provider output", stderr: "403" }));
    expect(result.status).toBe("blocked");
    expect(JSON.stringify(result)).not.toContain("private provider output");
    expect((await verifyRemoteStandards({ ...project, issueTracker: { type: "other" } }, provider())).status).toBe("unsupported");
  });
});

it("scans committed PR content with an empty staging area and never echoes findings", async () => {
  const path = await repository();
  await commit(path);
  const base = (await exec("git", ["rev-parse", "HEAD"], { cwd: path })).stdout.trim();
  const secret = ["sb_secret", "x".repeat(24)].join("_");
  await writeFile(join(path, "README.md"), `# Fixture\n${secret}\n`);
  await commit(path);
  expect((await exec("git", ["diff", "--cached"], { cwd: path })).stdout).toBe("");
  const script = resolve("scripts/check-sensitive-content.ts");
  const loader = resolve("node_modules/tsx/dist/loader.mjs");
  try {
    await exec(process.execPath, ["--import", loader, script, "--base", base], { cwd: path });
    throw new Error("expected scan to fail");
  } catch (error) {
    const failure = error as { code: number; stderr: string; stdout: string };
    expect(failure.code).toBe(1);
    expect(failure.stderr).toContain("Sensitive content detected in committed changes");
    expect(failure.stderr + failure.stdout).not.toContain(secret);
  }
});

it("prepares and validates a registered project without resolving unrelated provider targets", async () => {
  const root = await repository();
  const path = join(root, "planned");
  const quality = { lint: check, format: check };
  await writeFile(join(root, "projects.yml"), stringify({
    defaults: { default_branch: "main", setup_script: "scripts/setup.sh", issue_tracker: { type: "github" } },
    projects: {
      fixture: { remote: project.remote, quality },
      unrelated: { remote: "https://example.invalid/unrelated.git", tool_mappings: { crm: { provider: "attio", targets: [{ id: "${HARNESS_STANDARDS_UNSET_TARGET}", access: "read" }] } } },
    },
  }));
  const script = resolve("scripts/project-standards.ts");
  const loader = resolve("node_modules/tsx/dist/loader.mjs");
  await exec(process.execPath, ["--import", loader, script, "prepare", "fixture", path], { cwd: root });
  const result = await exec(process.execPath, ["--import", loader, script, "bootstrap", "fixture", path], { cwd: root });
  expect(result.stdout).toContain("locally-validated: 2 checks executed");
  expect((await exec("git", ["remote"], { cwd: path })).stdout).toBe("");
});
