import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { installPrivacyHook } from "../scripts/install-hooks.js";

const exec = promisify(execFile);
const repository = resolve(import.meta.dirname, "..");
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "harness-guardrails-"));
  roots.push(root);
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  await git("init", "--initial-branch=main");
  await git("config", "user.name", "Fixture");
  await git("config", "user.email", ["fixture", "example.test"].join("@"));
  await git("commit", "--allow-empty", "-m", "baseline");
  for (const directory of ["scripts", "src", ".githooks"]) await mkdir(join(root, directory));
  for (const file of ["scripts/check-sensitive-content.ts", "src/sensitive-content.ts", ".githooks/pre-commit"]) await cp(join(repository, file), join(root, file));
  await symlink(join(repository, "node_modules"), join(root, "node_modules"), "junction");
  await writeFile(join(root, "package.json"), JSON.stringify({ type: "module", scripts: { "check:sensitive": "node --import tsx scripts/check-sensitive-content.ts" } }));
  const scan = (...args: string[]) => exec(process.execPath, ["--import", "tsx", "scripts/check-sensitive-content.ts", ...args], { cwd: root });
  return { root, git, scan };
}
async function rejection(operation: Promise<unknown>): Promise<{ stdout: string; stderr: string }> {
  try { await operation; throw new Error("Expected command failure"); }
  catch (error) {
    if (error && typeof error === "object" && "stderr" in error) return error as { stdout: string; stderr: string };
    throw error;
  }
}
const secret = ["synthetic", "credential", "value"].join("-");

describe("repository guardrails", () => {
  it("scans staged and committed branch changes and emits locations without secret values", async () => {
    const { root, git, scan } = await fixture();
    expect((await scan()).stdout).toContain("No changes to scan");
    const base = (await git("rev-parse", "HEAD")).stdout.trim();
    await writeFile(join(root, "notes.md"), `token: ${secret}\n`);
    await git("add", "notes.md");
    const staged = await rejection(scan("--staged"));
    expect(staged.stderr).toContain('"notes.md":1: likely credential');
    expect(staged.stderr).not.toContain(secret);
    await git("commit", "-m", "fixture finding");
    expect((await scan()).stdout).toContain("No changes to scan");
    const branch = await rejection(scan("--base", base));
    expect(branch.stderr).toContain('"notes.md":1: likely credential');
    expect(branch.stderr).not.toContain(secret);
    expect((await scan("--help")).stdout).toContain("Usage:");
    expect((await rejection(scan("--unknown"))).stderr).toContain("Usage:");
    expect((await rejection(scan("--base", "missing"))).stderr).toContain("check failed");
  });

  it("installs idempotently and blocks an unsafe commit through the actual hook", async () => {
    const { root, git } = await fixture();
    expect(await installPrivacyHook(root)).toContain("enabled");
    expect(await installPrivacyHook(root)).toContain("already configured");
    await writeFile(join(root, "notes.md"), `password: ${secret}\n`);
    await git("add", "notes.md");
    const result = await rejection(git("commit", "-m", "blocked"));
    expect(result.stderr).toContain("likely credential");
    expect(result.stderr).not.toContain(secret);
    await writeFile(join(root, "notes.md"), "Public research captured 2026-10-28.\n");
    await git("add", "notes.md");
    await expect(git("commit", "-m", "safe")).resolves.toBeDefined();
  });

  it("preserves a custom hook path and an existing default hook", async () => {
    const { root, git } = await fixture();
    await git("config", "core.hooksPath", "custom-hooks");
    await expect(installPrivacyHook(root)).rejects.toThrow("core.hooksPath preserved");
    expect((await git("config", "core.hooksPath")).stdout.trim()).toBe("custom-hooks");
    await git("config", "--unset", "core.hooksPath");
    const hook = join(root, ".git/hooks/pre-commit");
    await writeFile(hook, "# existing owner hook\n");
    await expect(installPrivacyHook(root)).rejects.toThrow("pre-commit hook preserved");
    expect(await readFile(hook, "utf8")).toBe("# existing owner hook\n");
  });
});
