import type { ProjectDefinition } from "./project-config.js";

const validName = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,89}$/;

export function projectWorkspaceNames(projects: Record<string, ProjectDefinition>): string[] {
  const owners = new Map<string, string>();
  for (const project of Object.values(projects)) {
    const workspace = project.hcpWorkspace;
    if (!workspace) continue;
    if (!validName.test(workspace) || workspace === "platform-bootstrap" || workspace === "harness") {
      throw new Error(`projects.${project.name}.hcp_workspace is not an available HCP workspace name`);
    }
    const owner = owners.get(workspace);
    if (owner) throw new Error(`projects.${project.name}.hcp_workspace duplicates projects.${owner}.hcp_workspace`);
    owners.set(workspace, project.name);
  }
  return [...owners.keys()].sort();
}
