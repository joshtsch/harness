import { resolve } from "node:path";
import { loadProjectsConfig, type ProjectWiki } from "./project-config.js";

export interface WikiInventoryItem extends ProjectWiki {
  project: string;
  projectRoot: string;
}

export async function discoverProjectWikis(harnessRoot: string): Promise<WikiInventoryItem[]> {
  const projects = await loadProjectsConfig(resolve(harnessRoot, "projects.yml"), { resolveEnvironment: false });
  return Object.values(projects)
    .filter((project) => project.wiki !== undefined)
    .map((project) => ({
      project: project.name,
      projectRoot: resolve(harnessRoot, "projects", project.name),
      ...project.wiki!,
    }));
}
