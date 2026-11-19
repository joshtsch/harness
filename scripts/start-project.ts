#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { constants } from "node:os";
import { resolve } from "node:path";
import { loadProjectsConfig, type WorkflowCommand } from "../src/project-config.js";

const usage = "Usage: pnpm start <project> [--<mode>] [-- extra args]";
const argv = process.argv.slice(2);
const split = argv.indexOf("--");
const [name, ...flags] = split === -1 ? argv : argv.slice(0, split);
const extra = split === -1 ? [] : argv.slice(split + 1);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!name || name.startsWith("-") || flags.length > 1 || flags.some((flag) => !/^--[a-z][a-z0-9-]*$/.test(flag))) fail(usage);

let projects;
try {
  projects = await loadProjectsConfig(resolve("projects.yml"), { resolveEnvironment: false });
} catch {
  // YAML parser errors can contain private source values.
  fail("Unable to load project configuration; validate projects.yml and projects.local.yml.");
}
const project = projects[name];
if (!project) fail(`Unknown project ${name}; run pnpm projects to list configured names.`);
if (!project.start) fail(`Project ${name} has no start command; add projects.${name}.start to projects.yml or projects.local.yml (see docs/agents/project-configuration.md).`);
const { start } = project;
const mode = flags[0]?.slice(2) ?? start.default;
const command = start.modes[mode];
if (!command) fail(`Project ${name} has no start mode ${mode}; modes: ${Object.keys(start.modes).join(", ")}.`);

const root = resolve("projects", name);
if (!existsSync(resolve(root, ".git"))) fail(`No main clone at ${root}; run pnpm clone ${name} first.`);

const git = (...args: string[]) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
function run({ command, args }: WorkflowCommand, more: string[] = []): number {
  const result = spawnSync(command, [...args, ...more], { cwd: root, stdio: "inherit" });
  if (result.error) console.error(`${command}: ${result.error.message}`);
  return result.status ?? (result.signal ? 128 + (constants.signals[result.signal] ?? 0) : 1);
}

const branch = git("symbolic-ref", "--quiet", "--short", "HEAD").stdout.trim();
const dirty = git("status", "--porcelain").stdout.trim() !== "";
if (branch !== project.defaultBranch || dirty) {
  console.warn(`warning: ${root} is ${dirty ? "not clean" : `on ${branch || "a detached HEAD"}, not ${project.defaultBranch}`}; starting what is checked out without updating.`);
} else if (run({ command: "git", args: ["pull", "--ff-only"], required: true }) !== 0) {
  console.warn(`warning: git pull --ff-only failed in ${root}; starting what is checked out without updating.`);
} else if (start.install && run(start.install) !== 0) {
  fail(`Install failed in ${root}; not starting.`);
}

console.log(`Starting ${name} (${mode}) in ${root}`);
process.exitCode = run(command, extra);
