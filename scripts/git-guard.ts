#!/usr/bin/env tsx
// Checks a Claude Code Bash tool call before it runs `git commit`. Exit 2 blocks the call.
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
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
const harnessRoot = resolve(import.meta.dirname, "..");
const [branch, names, diff, commonDirectory, harnessCommonDirectory] = await Promise.all([
  git("symbolic-ref", "--short", "HEAD"),
  git("diff", "--cached", "--name-only", "-z"),
  git("diff", "--cached", "--no-ext-diff", "--no-textconv", "--binary", "--unified=0"),
  git("rev-parse", "--path-format=absolute", "--git-common-dir").then((path) => path && realpath(path.trim())).catch(() => undefined),
  exec("git", ["-C", harnessRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"]).then(({ stdout }) => realpath(stdout.trim()), () => undefined),
]);
// Not a repository or git failed: let git report its own error.
if (names === undefined || diff === undefined) process.exit(0);

const violations = commitGuardViolations({
  branch: branch?.trim(),
  stagedPaths: names.split("\0").filter(Boolean),
  stagedDiff: diff,
  stagesChanges: invocation.stagesChanges,
  // Branch naming is a harness rule; child repositories keep their own conventions.
  harnessRepository: commonDirectory !== undefined && commonDirectory === harnessCommonDirectory,
});
if (violations.length) {
  console.error(`Harness commit guard blocked this commit in ${invocation.directory}:`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(2);
}
