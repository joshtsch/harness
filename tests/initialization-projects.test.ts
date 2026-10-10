import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { initializeProjects, parseInitializationArgs } from "../src/initialization-projects.js";

const execute = promisify(execFile);
const directories: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "harness-init-projects-"));
  directories.push(root);
  await writeFile(join(root, "projects.yml"), "projects: {}\n");
  return root;
}
async function configure(root: string, names: string[], remote: string | Record<string, string>) {
  await writeFile(join(root, "projects.local.yml"), stringify({ projects: Object.fromEntries(names.map((name) => [name, {
    remote: typeof remote === "string" ? remote : remote[name], default_branch: "main", setup_script: "scripts/setup.sh", issue_tracker: { type: "github", repository: "example/fixture" },
  }])) }));
}
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("initialization arguments", () => {
  it("supports clone opt-in with either provider and flag order", () => {
    expect(parseInitializationArgs([])).toEqual({ provider: "codex", cloneProjects: false });
    expect(parseInitializationArgs(["--clone-projects"])).toEqual({ provider: "codex", cloneProjects: true });
    for (const provider of ["codex", "gemini"]) {
      for (const args of [["--clone-projects", "--provider", provider], ["--provider", provider, "--clone-projects"]]) {
        expect(parseInitializationArgs(args)).toEqual({ provider, cloneProjects: true });
      }
    }
    for (const args of [["--clone-projects", "--clone-projects"], ["--unknown"], ["--provider", "invalid"]]) {
      expect(() => parseInitializationArgs(args)).toThrow("Usage:");
    }
  });
});

describe("initialization projects", () => {
  it("handles empty configuration without creating a projects directory", async () => {
    const root = await fixture();
    await expect(initializeProjects(root, true)).resolves.toEqual([]);
    await expect(stat(join(root, "projects"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports missing local-overlay projects without cloning or touching their remotes", async () => {
    const root = await fixture();
    await configure(root, ["missing"], join(root, "unavailable-origin"));
    await expect(initializeProjects(root, false)).resolves.toEqual([{ name: "missing", status: "missing" }]);
    await expect(stat(join(root, "projects"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("clones missing projects and preserves existing dirty repositories across retries", async () => {
    const root = await fixture();
    const source = join(root, "source");
    await execute("git", ["init", "--initial-branch=main", source]);
    await execute("git", ["-C", source, "config", "user.name", "Test"]);
    await execute("git", ["-C", source, "config", "user.email", "test@localhost"]);
    await writeFile(join(source, "README.md"), "initial\n");
    await execute("git", ["-C", source, "add", "."]);
    await execute("git", ["-C", source, "commit", "-m", "initial"]);
    const origin = join(root, "origin.git");
    await execute("git", ["clone", "--bare", source, origin]);
    await configure(root, ["existing", "missing"], { existing: source, missing: origin });
    const existing = join(root, "projects/existing");
    await execute("git", ["clone", source, existing]);
    const before = (await execute("git", ["-C", existing, "rev-parse", "HEAD"])).stdout;
    await writeFile(join(existing, "README.md"), "dirty\n");
    await writeFile(join(existing, "untracked.txt"), "preserve\n");
    await expect(initializeProjects(root, false)).resolves.toEqual([{ name: "existing", status: "existing" }, { name: "missing", status: "missing" }]);
    await expect(initializeProjects(root, true)).resolves.toEqual([{ name: "existing", status: "existing" }, { name: "missing", status: "cloned" }]);
    expect((await execute("git", ["-C", join(root, "projects/missing"), "rev-parse", "HEAD"])).stdout).toBe(before);
    await expect(initializeProjects(root, true)).resolves.toEqual([{ name: "existing", status: "existing" }, { name: "missing", status: "existing" }]);
    expect((await execute("git", ["-C", existing, "rev-parse", "HEAD"])).stdout).toBe(before);
    expect(await readFile(join(existing, "README.md"), "utf8")).toBe("dirty\n");
    expect(await readFile(join(existing, "untracked.txt"), "utf8")).toBe("preserve\n");
  });

  it("continues after failed clones and suppresses command output", async () => {
    const root = await fixture();
    await configure(root, ["first", "second"], { first: join(root, "PRIVATE_COMMAND_DETAIL/first"), second: join(root, "PRIVATE_COMMAND_DETAIL/second") });
    const results = await initializeProjects(root, true);
    expect(results.map(({ status }) => status)).toEqual(["failed", "failed"]);
    expect(JSON.stringify(results)).not.toContain("PRIVATE_COMMAND_DETAIL");
  });

  it("rejects invalid configuration before creating project directories", async () => {
    const root = await fixture();
    await writeFile(join(root, "projects.local.yml"), "projects:\n  invalid:\n    unsupported: true\n");
    await expect(initializeProjects(root, true)).rejects.toThrow();
    await expect(stat(join(root, "projects"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports an existing directory inside another repository as failed", async () => {
    const root = await fixture();
    await execute("git", ["init", root]);
    await configure(root, ["invalid"], join(root, "origin"));
    await mkdir(join(root, "projects/invalid"), { recursive: true });
    expect((await initializeProjects(root, false))[0]?.status).toBe("failed");
  });
});
