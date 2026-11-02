import { isAbsolute, posix, resolve } from "node:path";
import { findSensitiveContent } from "./sensitive-content.js";

export interface CommitInvocation {
  directory: string;
  stagesChanges: boolean;
}

const commitCommand = /(?:^|[;&|(]\s*|\s)git((?:\s+(?:-C\s+\S+|-c\s+\S+|--[a-z-]+(?:=\S+)?))*)\s+commit\b([^;&|]*)/;

function unquote(value: string): string {
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

// Best-effort parse of the repository a Bash command commits in. Returns
// undefined when the command contains no `git commit`.
export function parseCommitInvocation(command: string, cwd: string): CommitInvocation | undefined {
  const match = commitCommand.exec(command);
  if (!match) return undefined;
  let directory = cwd;
  const cd = /^\s*cd\s+(\S+)\s*&&/.exec(command);
  if (cd) directory = resolve(directory, unquote(cd[1]!));
  for (const option of match[1]!.matchAll(/-C\s+(\S+)/g)) {
    const path = unquote(option[1]!);
    directory = isAbsolute(path) ? path : resolve(directory, path);
  }
  const commitArgs = match[2]!;
  const stagesChanges = /\bgit\s+(?:add|rm|mv)\b/.test(command.slice(0, match.index))
    || /(?:^|\s)(?:-a|--all|-[a-zA-Z]*a[a-zA-Z]*)(?=\s|$)/.test(commitArgs.replace(/(["']).*?\1/g, ""))
    || /(?:^|\s)--(?:include|only)\b/.test(commitArgs);
  return { directory, stagesChanges };
}

export function forbiddenStagedPath(path: string): boolean {
  const name = posix.basename(path);
  if (name === "projects.local.yml") return true;
  return name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
}

export function commitGuardViolations(input: { branch: string | undefined; stagedPaths: string[]; stagedDiff: string; stagesChanges: boolean }): string[] {
  const violations: string[] = [];
  if (input.stagesChanges) violations.push("stage changes in a separate command before committing so the guard can check the staged diff");
  if (input.branch === "main" || input.branch === "master") violations.push(`commits on ${input.branch} are not allowed; create a feature branch`);
  for (const path of input.stagedPaths.filter(forbiddenStagedPath)) violations.push(`${path} must never be committed; unstage it`);
  for (const finding of findSensitiveContent(input.stagedDiff)) violations.push(`likely ${finding.kind} in the staged diff; inspect it locally and remove it`);
  return [...new Set(violations)];
}
