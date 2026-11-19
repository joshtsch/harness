import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { loadProjectsConfig } from "../src/project-config.js";

const exec = promisify(execFile);
const script = resolve(import.meta.dirname, "../scripts/start-project.ts");
const tsx = createRequire(import.meta.url).resolve("tsx");

// A harness root whose fixture project has a main clone of a local origin; every command logs to calls.
async function harness(start = true) {
  const dir = await mkdtemp(join(tmpdir(), "start-project-"));
  const git = (cwd: string, ...args: string[]) => exec("git", ["-c", "user.name=t", "-c", "user.email=test", "-C", cwd, ...args]);
  const log = (label: string) => `{ command: sh, args: [-c, 'echo "${label} $*" >> ${join(dir, "calls")}', sh] }`;
  await writeFile(join(dir, "projects.yml"), [
    "projects:",
    "  fixture:",
    `    remote: ${join(dir, "origin.git")}`,
    "    default_branch: main",
    "    setup_script: setup.sh",
    "    issue_tracker: { type: github }",
    ...(start ? ["    start:", `      install: ${log("install")}`, "      default: hosted", "      modes:", `        hosted: ${log("hosted")}`, `        local: ${log("local")}`] : []),
  ].join("\n"));
  await exec("git", ["init", "-q", "--bare", "-b", "main", join(dir, "origin.git")]);
  const clone = join(dir, "projects", "fixture");
  await exec("git", ["clone", "-q", join(dir, "origin.git"), clone]);
  await git(clone, "commit", "-q", "--allow-empty", "-m", "one");
  await git(clone, "push", "-q", "origin", "main");
  // A second commit reaches origin from elsewhere, so a pull has something to fetch.
  const other = join(dir, "other");
  await exec("git", ["clone", "-q", join(dir, "origin.git"), other]);
  await git(other, "commit", "-q", "--allow-empty", "-m", "two");
  await git(other, "push", "-q", "origin", "main");
  const run = (...args: string[]) => exec(process.execPath, ["--import", tsx, script, ...args], { cwd: dir })
    .then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }), (error: { code: number; stdout: string; stderr: string }) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }));
  const calls = () => readFile(join(dir, "calls"), "utf8").catch(() => "");
  const head = async () => (await git(clone, "log", "-1", "--format=%s")).stdout.trim();
  return { dir, clone, git, run, calls, head };
}

it("updates a clean clone on its default branch, installs, then starts the default mode with extra args", async () => {
  const h = await harness();
  const result = await h.run("fixture", "--", "--port", "4000");
  expect(result.code).toBe(0);
  expect(await h.head()).toBe("two");
  expect(await h.calls()).toBe("install \nhosted --port 4000\n");
});

it("starts a dirty clone as checked out, with a warning and no pull or install", async () => {
  const h = await harness();
  await writeFile(join(h.clone, "scratch.txt"), "work in progress");
  const result = await h.run("fixture");
  expect(result.code).toBe(0);
  expect(result.stderr).toContain("not clean");
  expect(await h.head()).toBe("one");
  expect(await h.calls()).toBe("hosted \n");
  expect(await readFile(join(h.clone, "scratch.txt"), "utf8")).toBe("work in progress");
});

it("starts a clone on another branch without switching back", async () => {
  const h = await harness();
  await h.git(h.clone, "switch", "-q", "-c", "feature");
  const result = await h.run("fixture", "--local");
  expect(result.code).toBe(0);
  expect(result.stderr).toContain("on feature, not main");
  expect(await h.head()).toBe("one");
  expect((await h.git(h.clone, "branch", "--show-current")).stdout.trim()).toBe("feature");
  expect(await h.calls()).toBe("local \n");
});

it("fails clearly for a project without a start command or an unknown mode", async () => {
  const h = await harness(false);
  const missing = await h.run("fixture");
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain("has no start command; add projects.fixture.start");
  const withStart = await harness();
  const unknown = await withStart.run("fixture", "--staging");
  expect(unknown.code).toBe(1);
  expect(unknown.stderr).toContain("no start mode staging; modes: hosted, local");
  expect(await withStart.calls()).toBe("");
});

it("names a start command that cannot be run", async () => {
  const h = await harness();
  await writeFile(join(h.dir, "projects.local.yml"), "projects:\n  fixture:\n    start:\n      modes:\n        local: { command: no-such-start-command, args: [] }\n");
  const result = await h.run("fixture", "--local");
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("no-such-start-command: spawnSync no-such-start-command ENOENT");
});

it("validates the merged start block", async () => {
  const dir = await mkdtemp(join(tmpdir(), "start-config-"));
  const base = "projects:\n  p:\n    remote: r\n    default_branch: main\n    setup_script: s\n    issue_tracker: { type: github }\n    start:\n      default: local\n      modes:\n        local: { command: pnpm, args: [dev] }\n";
  await writeFile(join(dir, "projects.yml"), base);
  // The local overlay adds a mode and makes it the default, as an installation does for hosted use.
  await writeFile(join(dir, "projects.local.yml"), "projects:\n  p:\n    start:\n      default: hosted\n      modes:\n        hosted: { command: pnpm, args: [dev, --hosted] }\n");
  const { p } = await loadProjectsConfig(join(dir, "projects.yml"), { resolveEnvironment: false });
  expect(p?.start?.default).toBe("hosted");
  expect(Object.keys(p?.start?.modes ?? {})).toEqual(["local", "hosted"]);
  await writeFile(join(dir, "projects.local.yml"), "projects:\n  p:\n    start:\n      default: staging\n");
  await expect(loadProjectsConfig(join(dir, "projects.yml"), { resolveEnvironment: false })).rejects.toThrow("projects.p.start.default references unknown mode staging");
});
