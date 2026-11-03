#!/usr/bin/env tsx
// Checks a Claude Code file-writing tool call before it runs. Exit 2 blocks writes inside a default clone.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { defaultCloneProject, toolWriteTargets, type ToolCall } from "../src/default-clone-guard.js";
import { resolveMemoryDestination } from "../src/memory-proposal.js";
import { loadProjectsConfig } from "../src/project-config.js";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const targets = toolWriteTargets(JSON.parse(input || "{}") as ToolCall);
if (!targets.length) process.exit(0);

// Default clones belong to the main harness checkout, also when this script runs from a harness worktree.
const scriptRoot = resolve(import.meta.dirname, "..");
const gitCommonDir = execFileSync("git", ["-C", scriptRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
const harnessRoot = dirname(gitCommonDir);
const projects = Object.keys(await loadProjectsConfig(resolve(harnessRoot, "projects.yml"), { resolveEnvironment: false }));
const projectsDirectory = await resolveMemoryDestination(resolve(harnessRoot, "projects"));

for (const target of targets) {
  const project = defaultCloneProject(await resolveMemoryDestination(target), projectsDirectory, projects);
  if (!project) continue;
  console.error(`Harness default-clone guard blocked a write to ${target}: projects/${project} is the default clone and is never used for implementation.`);
  console.error(`From the harness root (${harnessRoot}), run \`pnpm worktree ${project} <issue-key> "<title>"\` and edit the worktree it prints instead.`);
  process.exit(2);
}
