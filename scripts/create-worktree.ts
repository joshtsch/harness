#!/usr/bin/env tsx
import { resolve } from "node:path";
import { loadProjectsConfig, requireProjectQuality } from "../src/project-config.js";
import { ensureProjectClone, createProjectWorktree, recordSetupEvent, runProjectSetup, verifyPreparedProject, resolveWorktreeRoot } from "../src/session/index.js";
import { parseWorktreeArgs } from "../src/session/worktree-input.js";
import { resolveIssue } from "../src/issue-tracker.js";
import type { CommandRunner } from "../src/session/worktree.js";

const args = process.argv.slice(2);
const { projectName, issueKey, ticketTitle, refresh, provisional, branch, base } = parseWorktreeArgs(args);
const run: CommandRunner = async (command, commandArgs) => {
  const { execFile } = await import("node:child_process");
  return new Promise((resolveResult) => execFile(command, commandArgs, (error, stdout, stderr) => resolveResult({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr })));
};
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session";

const projects = await loadProjectsConfig(resolve("projects.yml"), { resolveEnvironment: false });
const configured = projects[projectName];
if (!configured) {
  console.error(`Unknown project: ${projectName}`);
  process.exitCode = 1;
} else {
  requireProjectQuality(configured);
  if (provisional) console.warn(`Provisional worktree: issue ${issueKey} was not checked. Record the tracker outage under docs/.scratch/; do not push or open a merge request until the issue exists and the branch is renamed.`);
  else if (configured.issueTracker.type === "github") await resolveIssue(configured.issueTracker, issueKey, run);
  const harnessRoot = resolve(".");
  const worktreesDirectory = await resolveWorktreeRoot(harnessRoot);
  const clone = await ensureProjectClone(configured, { projectsDirectory: resolve("projects") });
  const bootstrapOptions = {
    projectRoot: clone.path,
    issueKey,
    purpose: ticketTitle,
    harnessRoot: resolve("."),
    sessionId: `${slug(issueKey)}-${slug(ticketTitle)}`.slice(0, 96).replace(/-+$/g, ""),
    logDirectory: resolve("docs/.scratch/setup"),
  };
  await runProjectSetup(configured, "bootstrap", bootstrapOptions);
  const result = await createProjectWorktree({ name: configured.name, path: clone.path, defaultBranch: configured.defaultBranch }, {
    harnessRoot, worktreesDirectory, issueKey, ticketTitle,
    refresh, provisional, branch, base, run,
    onRefresh: () => recordSetupEvent(bootstrapOptions, { type: "clone-refresh-requested", project: configured.name }),
  });
  const setupOptions = {
    ...bootstrapOptions,
    worktreePath: result.path,
    sessionId: result.branch,
  };
  await runProjectSetup(configured, "worktree", setupOptions);
  await verifyPreparedProject({ project: configured, worktreePath: result.path, options: setupOptions });
  console.log(`${result.action}: ${result.path}`);
}
