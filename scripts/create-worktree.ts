#!/usr/bin/env tsx
import { resolve } from "node:path";
import { loadProjectsConfig } from "../src/project-config.js";
import { ensureProjectClone, createProjectWorktree, recordSetupEvent, runProjectSetup, verifyProjectReady, resolveWorktreeRoot } from "../src/session/index.js";
import { parseWorktreeArgs } from "../src/session/worktree-input.js";

const args = process.argv.slice(2);
const { projectName, issueKey, ticketTitle, refresh, branch, base } = parseWorktreeArgs(args);
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session";

const projects = await loadProjectsConfig(resolve("projects.yml"), { resolveEnvironment: false });
const configured = projects[projectName];
if (!configured) {
  console.error(`Unknown project: ${projectName}`);
  process.exitCode = 1;
} else {
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
    refresh, branch, base,
    onRefresh: () => recordSetupEvent(bootstrapOptions, { type: "clone-refresh-requested", project: configured.name }),
    run: async (command, args) => {
      const { execFile } = await import("node:child_process");
      return new Promise((resolveResult) => execFile(command, args, (error, stdout, stderr) => resolveResult({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr })));
    },
  });
  const setupOptions = {
    projectRoot: clone.path,
    worktreePath: result.path,
    issueKey,
    purpose: ticketTitle,
    harnessRoot: resolve("."),
    sessionId: result.branch,
    logDirectory: resolve("docs/.scratch/setup"),
  };
  await runProjectSetup(configured, "worktree", setupOptions);
  await verifyProjectReady(result.path);
  console.log(`${result.action}: ${result.path}`);
}
