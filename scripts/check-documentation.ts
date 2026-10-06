import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { documentationViolations } from "../src/documentation-policy.js";

const repoRoot = resolve(import.meta.dirname, "..");

async function repositoryFiles(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".agents", ".codex", ".scratch", "node_modules", "dist", ".worktrees", "projects"].includes(entry.name)) continue;
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(path);
      files.push(...await repositoryFiles(resolve(directory, entry.name), `${path}/`));
    }
    else files.push(path);
  }
  return files;
}

async function run(): Promise<void> {
  const paths = await repositoryFiles(repoRoot);
  const contents: Record<string, string> = {};
  for (const path of paths.filter((candidate) => candidate.endsWith(".md"))) contents[path] = await readFile(resolve(repoRoot, path), "utf8");
  const violations = documentationViolations({ paths, contents });
  if (violations.length > 0) throw new Error(violations.join("\n"));
  console.log("Documentation structure passes policy checks.");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
