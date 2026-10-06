#!/usr/bin/env tsx
import { resolve } from "node:path";
import { loadProjectsConfig } from "../src/project-config.js";
import { ensureProjectClone } from "../src/session/index.js";

const projectName = process.argv[2];
if (!projectName) {
  console.error("Usage: pnpm clone <project-name>");
  process.exitCode = 1;
} else {
  const config = await loadProjectsConfig(resolve("projects.yml"), { resolveEnvironment: false });
  const project = config[projectName];
  if (!project) {
    console.error(`Unknown project: ${projectName}`);
    process.exitCode = 1;
  } else {
    const result = await ensureProjectClone(project, { projectsDirectory: resolve("projects") });
    console.log(`${result.action}: ${result.path}`);
  }
}
