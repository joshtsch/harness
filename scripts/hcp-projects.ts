#!/usr/bin/env tsx
import { unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadProjectsConfig } from "../src/project-config.js";
import {
  parseProjectInputRetirements,
  projectInputStateAddress,
  projectWorkspaceInventory,
  retirementMovedBlocks,
} from "../src/hcp-project-workspaces.js";

const [action, ...options] = process.argv.slice(2);

function hclLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/\$\{|%\{/g, (marker) => marker[0] + marker);
}

async function run(command: string, args: string[], environment: NodeJS.ProcessEnv, capture = false): Promise<string> {
  let output = "";
  const code = await new Promise<number>((done, reject) => {
    const child = spawn(command, args, { env: environment, stdio: ["inherit", capture ? "pipe" : "inherit", "inherit"] });
    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (status) => done(status ?? 1));
  });
  if (code !== 0) throw new Error(`${command} exited with status ${code}`);
  return output;
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

  let projectVariables: Parameters<typeof parseProjectInputRetirements>[2];
  const suppliedVariables = process.env.TF_VAR_project_workspace_variables;
  if (suppliedVariables?.trim()) {
    try {
      const parsed: unknown = JSON.parse(suppliedVariables);
      const mapping = (value: unknown): value is Record<string, unknown> =>
        value !== null && typeof value === "object" && !Array.isArray(value);
      if (!mapping(parsed) || !Object.entries(parsed).every(([workspace, categories]) =>
        names.includes(workspace) && mapping(categories) && Object.entries(categories).every(([category, variables]) =>
          ["environment", "terraform"].includes(category) && mapping(variables)
          && Object.entries(variables).every(([key, value]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof value === "string")))) {
        throw new Error();
      }
      projectVariables = parsed as typeof projectVariables;
    } catch {
      throw new Error("TF_VAR_project_workspace_variables must map registered workspaces to environment/terraform string maps");
    }
  }

  const suppliedRetirements = process.env.HCP_RETIRE_PROJECT_INPUTS;
  const retirements = suppliedRetirements?.trim()
    ? parseProjectInputRetirements(suppliedRetirements, names, projectVariables)
    : [];

  const terraformRoot = resolve("infrastructure/hcp");
  const variables = join(terraformRoot, "onboarding.auto.tfvars");
  const moves = join(terraformRoot, "onboarding-retire.tf");
  let wroteVariables = false;
  let wroteMoves = false;
  try {
    if (retirements.length > 0) {
      await writeFile(moves, retirementMovedBlocks(retirements), { mode: 0o600, flag: "wx" });
      wroteMoves = true;
    }
    await writeFile(variables, [
      `project_workspace_names = ${JSON.stringify(names)}`,
      `project_workspace_organizations = ${JSON.stringify(inventory.workspaceOrganizations)}`,
      `project_organization_names = ${JSON.stringify(inventory.organizationNames)}`,
      ...(contactMap === undefined ? [] : [`project_organization_admin_emails = ${hclLiteral(contactMap)}`]),
      ...(providerCredential ? [`tfe_provider_token = ${hclLiteral(providerCredential)}`] : []),
      ...(projectVariables === undefined ? [] : [`project_workspace_variables = ${hclLiteral(projectVariables)}`]),
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
    if (retirements.length > 0) {
      // A move whose source is absent is a silent no-op, so check state first.
      const managed = new Set((await run("terraform", [`-chdir=${terraformRoot}`, "state", "list"], environment, true)).split("\n"));
      const unmatched = retirements.filter((entry) => !managed.has(projectInputStateAddress(entry)));
      if (unmatched.length > 0) {
        throw new Error(`HCP_RETIRE_PROJECT_INPUTS entries match no managed project input: ${unmatched.map((entry) => JSON.stringify(entry)).join(", ")}`);
      }
      console.log(`This ${action} retires (destroys) ${retirements.length} protected project input(s):`);
      for (const [workspace, category, key] of retirements) console.log(`  - ${workspace} ${category} ${key}`);
    }
    await run("terraform", [`-chdir=${terraformRoot}`, action, "-var-file=onboarding.auto.tfvars", ...(action === "plan" ? ["-input=false"] : [])], environment);
  } finally {
    if (wroteMoves) await unlink(moves);
    if (wroteVariables) await unlink(variables);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
