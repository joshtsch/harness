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
