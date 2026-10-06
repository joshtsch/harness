#!/usr/bin/env tsx
import { resolve } from "node:path";
import { loadProjectsConfig } from "../src/project-config.js";
import { ensureProjectClone, runProjectSetup } from "../src/session/index.js";

const usage = "Usage: pnpm setup <bootstrap|worktree> <project-name> <issue-key> <purpose> <session-id> [worktree-path]";
const [phase, projectName, issueKey, purpose, sessionId, worktreePath] = process.argv.slice(2);
if (phase !== "bootstrap" && phase !== "worktree") throw new Error(usage);
if (!projectName || !issueKey || !purpose || !sessionId || (phase === "worktree" && !worktreePath)) {
  throw new Error(usage);
}
const projects = await loadProjectsConfig(resolve("projects.yml"));
const project = projects[projectName];
if (!project) throw new Error(`Unknown project: ${projectName}`);
const clone = await ensureProjectClone(project, { projectsDirectory: resolve("projects") });
const result = await runProjectSetup(project, phase, { projectRoot: clone.path, worktreePath, issueKey, purpose, harnessRoot: resolve("."), sessionId, logDirectory: resolve("docs/.scratch/setup") });
console.log(`${result.phase}: ${result.logPath}`);
