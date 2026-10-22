#!/usr/bin/env tsx
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadProjectsConfig } from "../src/project-config.js";
import { projectWorkspaceInventory } from "../src/hcp-project-workspaces.js";

const [action, ...options] = process.argv.slice(2);

async function run(command: string, args: string[], environment: NodeJS.ProcessEnv): Promise<void> {
  const code = await new Promise<number>((done, reject) => {
    const child = spawn(command, args, { env: environment, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (status) => done(status ?? 1));
  });
  if (code !== 0) throw new Error(`${command} exited with status ${code}`);
}

try {
  if (action !== "plan" && action !== "apply") {
    throw new Error("Usage: pnpm hcp:projects <plan|apply> [--config-root <harness-path>]");
  }
  let configRoot = resolve(".");
  if (options.length > 0) {
    if (options.length !== 2 || options[0] !== "--config-root" || !options[1]) {
      throw new Error("Expected --config-root <harness-path>");
    }
    configRoot = resolve(options[1]);
  }
  const organization = process.env.TF_VAR_tfe_organization;
  if (!organization) throw new Error("Set TF_VAR_tfe_organization for the existing HCP organization");

  const projects = await loadProjectsConfig(join(configRoot, "projects.yml"), { resolveEnvironment: false });
  const inventory = projectWorkspaceInventory(projects);
  const names = inventory.workspaceNames;
  if (names.length === 0) throw new Error("No Terraform projects are configured; refusing an empty workspace inventory");

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "harness-hcp-projects-"));
  const terraformRoot = resolve("infrastructure/hcp");
  const variables = join(terraformRoot, "onboarding.auto.tfvars");
  let wroteVariables = false;
  try {
    const backend = join(temporaryDirectory, "bootstrap.tfbackend");
    await writeFile(backend, `organization = ${JSON.stringify(organization)}\nworkspaces { name = "platform-bootstrap" }\n`, { mode: 0o600 });
    await writeFile(variables, [
      `project_workspace_names = ${JSON.stringify(names)}`,
      `project_workspace_organizations = ${JSON.stringify(inventory.workspaceOrganizations)}`,
      `project_organization_names = ${JSON.stringify(inventory.organizationNames)}`,
    ].join("\n") + "\n", { mode: 0o600, flag: "wx" });
    wroteVariables = true;
    const environment = {
      ...process.env,
      TF_VAR_tfe_organization: organization,
    };
    await run("terraform", [`-chdir=${terraformRoot}`, "init", "-input=false", `-backend-config=${backend}`], environment);
    await run("terraform", [`-chdir=${terraformRoot}`, action, ...(action === "plan" ? ["-input=false"] : [])], environment);
  } finally {
    if (wroteVariables) await unlink(variables);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
