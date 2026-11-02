#!/usr/bin/env tsx
// Checks a Claude Code Bash tool call before it runs `git commit`. Exit 2 blocks the call.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { commitGuardViolations, parseCommitInvocation } from "../src/git-guard.js";

const exec = promisify(execFile);
let input = "";
for await (const chunk of process.stdin) input += chunk;
const event = JSON.parse(input || "{}") as { cwd?: string; tool_input?: { command?: string } };
const invocation = parseCommitInvocation(event.tool_input?.command ?? "", event.cwd ?? process.cwd());
if (!invocation) process.exit(0);

const git = async (...args: string[]): Promise<string | undefined> => {
  try {
    return (await exec("git", ["-C", invocation.directory, ...args], { maxBuffer: 32 * 1024 * 1024 })).stdout;
  } catch {
    return undefined;
  }
};
const [branch, names, diff] = await Promise.all([
  git("symbolic-ref", "--short", "HEAD"),
  git("diff", "--cached", "--name-only", "-z"),
  git("diff", "--cached", "--no-ext-diff", "--no-textconv", "--binary", "--unified=0"),
]);
// Not a repository or git failed: let git report its own error.
if (names === undefined || diff === undefined) process.exit(0);

const violations = commitGuardViolations({
  branch: branch?.trim(),
  stagedPaths: names.split("\0").filter(Boolean),
  stagedDiff: diff,
  stagesChanges: invocation.stagesChanges,
});
if (violations.length) {
  console.error(`Harness commit guard blocked this commit in ${invocation.directory}:`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(2);
}
