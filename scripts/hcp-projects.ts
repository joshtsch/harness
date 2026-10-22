#!/usr/bin/env tsx
import { unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadProjectsConfig } from "../src/project-config.js";
import { projectWorkspaceInventory } from "../src/hcp-project-workspaces.js";

const [action, ...options] = process.argv.slice(2);

function hclLiteral(value: string | Record<string, string>): string {
  return JSON.stringify(value).replace(/\$\{|%\{/g, (marker) => marker[0] + marker);
}

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
  const providerCredential = process.env.TFE_TOKEN?.trim();

  let contactMap: Record<string, string> | undefined;
  const suppliedContacts = process.env.TF_VAR_project_organization_admin_emails;
  if (suppliedContacts?.trim()) {
    try {
      const parsed: unknown = JSON.parse(suppliedContacts);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
          || !Object.values(parsed).every((value) => typeof value === "string" && value.trim().length > 0)) {
        throw new Error();
      }
      contactMap = parsed as Record<string, string>;
    } catch {
      throw new Error("TF_VAR_project_organization_admin_emails must be a JSON object of nonempty strings");
    }
  }

  const projects = await loadProjectsConfig(join(configRoot, "projects.yml"), { resolveEnvironment: false });
  const inventory = projectWorkspaceInventory(projects);
  const names = inventory.workspaceNames;
  if (names.length === 0) throw new Error("No Terraform projects are configured; refusing an empty workspace inventory");

  const terraformRoot = resolve("infrastructure/hcp");
  const variables = join(terraformRoot, "onboarding.auto.tfvars");
  let wroteVariables = false;
  try {
    await writeFile(variables, [
      `project_workspace_names = ${JSON.stringify(names)}`,
      `project_workspace_organizations = ${JSON.stringify(inventory.workspaceOrganizations)}`,
      `project_organization_names = ${JSON.stringify(inventory.organizationNames)}`,
      ...(contactMap === undefined ? [] : [`project_organization_admin_emails = ${hclLiteral(contactMap)}`]),
      ...(providerCredential ? [`tfe_provider_token = ${hclLiteral(providerCredential)}`] : []),
    ].join("\n") + "\n", { mode: 0o600, flag: "wx" });
    wroteVariables = true;
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      TF_VAR_tfe_organization: organization,
      TF_CLOUD_ORGANIZATION: organization,
    };
    // The named cloud workspace is pinned in configuration. A CLI workspace
    // override breaks migration from the single-workspace remote backend.
    delete environment.TF_WORKSPACE;
    await run("terraform", [`-chdir=${terraformRoot}`, "init", "-input=false"], environment);
    await run("terraform", [`-chdir=${terraformRoot}`, action, "-var-file=onboarding.auto.tfvars", ...(action === "plan" ? ["-input=false"] : [])], environment);
  } finally {
    if (wroteVariables) await unlink(variables);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
