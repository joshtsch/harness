import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { documentationViolations } from "../src/documentation-policy.js";

const exec = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");

async function repositoryFiles(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".agents", ".codex", ".scratch", "node_modules", "dist", ".worktrees", "projects"].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
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
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length && (args.length !== 2 || args[0] !== "--base")) throw new Error("Usage: pnpm check:docs [--base <ref>]");
  const { stdout: reference } = await exec("git", ["rev-parse", "--verify", "--end-of-options", `${args[1] ?? "HEAD"}^{commit}`], { cwd: repoRoot });
  const [{ stdout: added }, { stdout: untracked }] = await Promise.all([
    exec("git", ["diff", "--no-renames", "--name-only", "--diff-filter=A", "-z", reference.trim(), "--"], { cwd: repoRoot }),
    exec("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: repoRoot }),
  ]);
  const newPaths = `${added}${untracked}`.split("\0").filter(Boolean);
  const paths = await repositoryFiles(repoRoot);
  const contents: Record<string, string> = {};
  for (const path of paths.filter((candidate) => candidate.endsWith(".md"))) contents[path] = await readFile(resolve(repoRoot, path), "utf8");
  const violations = documentationViolations({ paths, contents, newPaths });
  if (violations.length > 0) throw new Error(violations.join("\n"));
  console.log("Documentation structure passes policy checks.");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
