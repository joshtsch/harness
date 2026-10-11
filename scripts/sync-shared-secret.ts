#!/usr/bin/env tsx
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadProjectsConfig } from "../src/project-config.js";

const secretValueEnvironmentVariable = "HARNESS_SHARED_SECRET_VALUE";
const usage = "Usage: pnpm secrets:sync <SECRET_NAME> [--apply]";

function parseArguments(args: string[]): { secretName: string; apply: boolean } {
  const applyCount = args.filter((arg) => arg === "--apply").length;
  const secretNames = args.filter((arg) => arg !== "--apply");
  if (applyCount > 1 || secretNames.length !== 1 || !/^[A-Z_][A-Z0-9_]*$/.test(secretNames[0]!)) {
    throw new Error(usage);
  }
  return { secretName: secretNames[0]!, apply: applyCount === 1 };
}

function githubRepositories(projects: Awaited<ReturnType<typeof loadProjectsConfig>>): string[] {
  const repositories = new Set<string>();
  for (const project of Object.values(projects)) {
    if (project.issueTracker.type !== "github") continue;
    const repository = project.issueTracker.repository;
    if (!repository || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      throw new Error(`Configured GitHub project ${project.name} must have a valid issue_tracker.repository.`);
    }
    repositories.add(repository);
  }
  if (repositories.size === 0) throw new Error("No configured GitHub project repositories found.");
  return [...repositories];
}

function setRepositorySecret(repository: string, secretName: string, value: string, cwd: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const env = { ...process.env };
    delete env[secretValueEnvironmentVariable];
    const child = spawn("gh", ["secret", "set", secretName, "--repo", repository], {
      cwd,
      env,
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.stdin.on("error", () => undefined);
    child.once("error", (error: NodeJS.ErrnoException) => {
      rejectPromise(new Error(`Could not start GitHub CLI (${error.code ?? "unknown error"}).`));
    });
    child.once("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`GitHub CLI exited with status ${code ?? "unknown"}.`));
    });
    child.stdin.end(value, "utf8");
  });
}

async function run(): Promise<void> {
  const { secretName, apply } = parseArguments(process.argv.slice(2));
  const harnessRoot = resolve(import.meta.dirname, "..");
  const projects = await loadProjectsConfig(resolve(harnessRoot, "projects.yml"), { resolveEnvironment: false });
  const repositories = githubRepositories(projects);
  if (!apply) {
    console.log(`Dry run: would sync ${secretName} to ${repositories.length} configured GitHub repositories. Add --apply to write.`);
    return;
  }

  const value = process.env[secretValueEnvironmentVariable];
  if (!value) throw new Error(`${secretValueEnvironmentVariable} must be set to a non-empty value before using --apply.`);

  let completed = 0;
  for (const repository of repositories) {
    try {
      await setRepositorySecret(repository, secretName, value, harnessRoot);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Secret sync stopped after ${completed} of ${repositories.length} repositories; ${repository} failed: ${message}. Rerun after fixing access; completed writes are safe to repeat.`);
    }
  }
  console.log(`Synced ${secretName} to ${completed} configured GitHub repositories.`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Secret sync failed.");
  process.exitCode = 1;
});
