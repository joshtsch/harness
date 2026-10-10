import { join } from "node:path";
import { loadProjectsConfig } from "./project-config.js";
import { parseAgentProviderArgs } from "./prerequisites.js";
import { ensureProjectClone, inspectProjectClone } from "./session/project-clone.js";

export function parseInitializationArgs(args: string[]): { provider: string; cloneProjects: boolean } {
  const usage = "Usage: pnpm init:harness [--provider codex|gemini] [--clone-projects]";
  const count = args.filter((arg) => arg === "--clone-projects").length;
  if (count > 1) throw new Error(usage);
  return {
    provider: parseAgentProviderArgs(args.filter((arg) => arg !== "--clone-projects"), usage),
    cloneProjects: count === 1,
  };
}

export interface InitializationProjectResult {
  name: string;
  status: "cloned" | "existing" | "missing" | "failed";
}

export async function initializeProjects(harnessRoot: string, cloneProjects: boolean): Promise<InitializationProjectResult[]> {
  const projects = await loadProjectsConfig(join(harnessRoot, "projects.yml"), { resolveEnvironment: false });
  const options = { projectsDirectory: join(harnessRoot, "projects") };
  const results: InitializationProjectResult[] = [];
  for (const project of Object.values(projects)) {
    try {
      const clone = cloneProjects ? await ensureProjectClone(project, options) : await inspectProjectClone(project, options);
      results.push({ name: project.name, status: clone?.action ?? "missing" });
    } catch {
      results.push({ name: project.name, status: "failed" });
    }
  }
  return results;
}
