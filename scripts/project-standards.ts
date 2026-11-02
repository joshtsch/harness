#!/usr/bin/env tsx
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadProjectsConfig } from "../src/project-config.js";
import { projectStandardsWorkflow, publishBootstrap, runStandardsCommand, standardsWorkflowPath, validateLocalStandards, verifyRemoteStandards } from "../src/project-standards.js";

try {
  const [operation, name, directory, ...extra] = process.argv.slice(2);
  if (!name || extra.length || !["prepare", "workflow", "bootstrap", "local", "publish", "remote"].includes(operation ?? "") || (operation !== "remote" && !directory)) {
    throw new Error("Usage: pnpm standards <prepare|workflow|bootstrap|local|publish|remote> <registered-project> [repository-path]");
  }
  const configuration = await loadProjectsConfig(resolve("projects.yml")).catch(() => {
    throw new Error("project configuration could not be loaded; validate the merged public/local configuration locally");
  });
  const project = configuration[name];
  if (!project) throw new Error("register and validate the planned project before onboarding");
  const path = resolve(directory ?? ".");
  if (operation === "prepare") {
    if (project.setupScript !== "scripts/setup.sh") throw new Error("custom setup path: prepare your project-owned setup contract manually");
    await mkdir(path, { recursive: true });
    if ((await readdir(path)).length) throw new Error("prepare requires an empty directory; preserve existing repositories and use bootstrap validation");
    const result = await runStandardsCommand("git", ["init", "--initial-branch", project.defaultBranch], { cwd: path, env: process.env });
    if (result.code !== 0) throw new Error("git init failed; verify Git availability");
    await mkdir(join(path, "scripts"));
    await writeFile(join(path, "README.md"), "# Project setup\n\nInitial setup and quality contract.\n");
    await writeFile(join(path, ".gitignore"), "node_modules/\n.env\n.env.*\n!.env.example\n");
    await writeFile(join(path, project.setupScript), '#!/usr/bin/env bash\nset -euo pipefail\ncase "${1:-}" in\n  bootstrap|worktree) ;;\n  *) exit 2 ;;\nesac\n# Add project-owned dependency setup here before enabling CI.\n');
    console.log("scaffold prepared; configure owner-approved lint/format and applicable verification commands, then run standards bootstrap");
  } else if (operation === "workflow") {
    await mkdir(join(path, ".github/workflows"), { recursive: true });
    await writeFile(join(path, standardsWorkflowPath), projectStandardsWorkflow(project), { flag: "wx" });
    console.log("workflow prepared; review setup installs the required toolchain before publishing");
  } else if (operation === "remote") {
    const result = await verifyRemoteStandards(project);
    console.log(`${result.status}: ${result.reason}; next: ${result.nextAction}`);
    if (result.status !== "remotely-enforced") process.exitCode = 1;
  } else if (operation === "publish") {
    await publishBootstrap({ project, path });
    console.log("initial scaffold published; remote enforcement remains unverified; run standards remote");
  } else {
    const result = await validateLocalStandards({ project, path, bootstrap: operation === "bootstrap" });
    console.log(`${result.status}: ${result.checks} checks executed; ${result.optionalFailures} optional failures; remote enforcement unverified`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "standards operation failed");
  process.exitCode = 1;
}
