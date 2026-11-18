import type { ProjectDefinition } from "./project-config.js";

const validName = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,89}$/;

export function projectWorkspaceNames(projects: Record<string, ProjectDefinition>): string[] {
  return projectWorkspaceInventory(projects).workspaceNames;
}

export function projectWorkspaceInventory(projects: Record<string, ProjectDefinition>): {
  workspaceNames: string[];
  workspaceOrganizations: Record<string, string>;
  organizationNames: string[];
} {
  const owners = new Map<string, string>();
  const workspaceOrganizations: Record<string, string> = {};
  const organizationNames = new Set<string>();
  for (const project of Object.values(projects)) {
    const workspace = project.hcpWorkspace;
    if (project.hcpOrganization && !workspace) {
      throw new Error(`projects.${project.name}.hcp_organization requires hcp_workspace`);
    }
    if (project.hcpOrganization && !validName.test(project.hcpOrganization)) {
      throw new Error(`projects.${project.name}.hcp_organization is not a valid HCP organization name`);
    }
    if (!workspace) continue;
    if (!validName.test(workspace) || workspace === "platform-bootstrap" || workspace === "harness") {
      throw new Error(`projects.${project.name}.hcp_workspace is not an available HCP workspace name`);
    }
    const owner = owners.get(workspace);
    if (owner) throw new Error(`projects.${project.name}.hcp_workspace duplicates projects.${owner}.hcp_workspace`);
    owners.set(workspace, project.name);
    if (project.hcpOrganization) {
      workspaceOrganizations[workspace] = project.hcpOrganization;
      organizationNames.add(project.hcpOrganization);
    }
  }
  return {
    workspaceNames: [...owners.keys()].sort(),
    workspaceOrganizations,
    organizationNames: [...organizationNames].sort(),
  };
}

export type ProjectInputAddress = [workspace: string, category: "environment" | "terraform", key: string];

const inputKey = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parses the private retire list and refuses entries that are malformed, duplicated, or still supplied. */
export function parseProjectInputRetirements(
  raw: string,
  workspaceNames: string[],
  suppliedInputs: Record<string, Partial<Record<string, Record<string, string>>>> | undefined,
): ProjectInputAddress[] {
  const usage = "HCP_RETIRE_PROJECT_INPUTS must be a JSON array of [workspace, \"environment\"|\"terraform\", key] entries";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(usage);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(usage);
  if (suppliedInputs === undefined) {
    throw new Error("Retiring project inputs requires the new complete TF_VAR_project_workspace_variables map");
  }
  const seen = new Set<string>();
  return parsed.map((entry: unknown) => {
    if (!Array.isArray(entry) || entry.length !== 3 || !entry.every((part) => typeof part === "string")) throw new Error(usage);
    const [workspace, category, key] = entry as string[];
    if (!workspaceNames.includes(workspace) || (category !== "environment" && category !== "terraform") || !inputKey.test(key)) {
      throw new Error(`${usage}; ${JSON.stringify(entry)} does not name a registered workspace input`);
    }
    const address = JSON.stringify(entry);
    if (seen.has(address)) throw new Error(`HCP_RETIRE_PROJECT_INPUTS lists ${address} twice`);
    seen.add(address);
    if (suppliedInputs[workspace]?.[category]?.[key] !== undefined) {
      throw new Error(`HCP_RETIRE_PROJECT_INPUTS lists ${address}, which TF_VAR_project_workspace_variables still supplies`);
    }
    return [workspace, category, key];
  });
}

/** The state address of a managed project input, as `terraform state list` prints it. */
export function projectInputStateAddress(entry: ProjectInputAddress, resource = "project_input"): string {
  return `tfe_variable.${resource}[${JSON.stringify(JSON.stringify(entry))}]`;
}

/**
 * Instance-level moves to an undeclared address. Terraform plans a destroy for each moved
 * instance, bypassing only that instance's prevent_destroy; Terraform also refuses a move
 * whose source is still declared.
 */
export function retirementMovedBlocks(entries: ProjectInputAddress[]): string {
  return entries.map((entry) => [
    "moved {",
    `  from = ${projectInputStateAddress(entry)}`,
    `  to   = ${projectInputStateAddress(entry, "retired_project_input")}`,
    "}",
  ].join("\n")).join("\n\n") + "\n";
}
