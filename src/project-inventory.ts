import { resolve } from "node:path";
import { loadProjectsConfig, type ProjectDefinition } from "./project-config.js";

export type ProjectInventoryItem = Pick<ProjectDefinition, "name" | "purpose" | "topics" | "excludes" | "wiki"> & {
  projectRoot: string;
};

export async function discoverConfiguredProjects(harnessRoot: string): Promise<ProjectInventoryItem[]> {
  const projects = await loadProjectsConfig(resolve(harnessRoot, "projects.yml"), { resolveEnvironment: false });
  return Object.values(projects).map(({ name, purpose, topics, excludes, wiki }) => ({
    name,
    projectRoot: resolve(harnessRoot, "projects", name),
    ...(purpose === undefined ? {} : { purpose }),
    ...(topics === undefined ? {} : { topics }),
    ...(excludes === undefined ? {} : { excludes }),
    ...(wiki === undefined ? {} : { wiki }),
  }));
}
