#!/usr/bin/env tsx
// Checks a Claude Code Bash tool call before it runs `git commit` or publishes an
// issue or change-request body with `gh`. Exit 2 blocks the call.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { commitGuardViolations, parseCommitInvocation, parsePublishBodies, publishGuardViolations } from "../src/git-guard.js";

const exec = promisify(execFile);
let input = "";
for await (const chunk of process.stdin) input += chunk;
const event = JSON.parse(input || "{}") as { cwd?: string; tool_input?: { command?: string } };
const command = event.tool_input?.command ?? "";
const cwd = event.cwd ?? process.cwd();

const published: string[] = [];
for (const body of parsePublishBodies(command, cwd)) {
  if ("text" in body) published.push(...publishGuardViolations("the inline body", body.text));
  else if (body.file === "-") published.push("the body comes from standard input; save it to a file and pass --body-file <path>");
  else {
    // An unreadable file is left for gh to report.
    const text = await readFile(body.file, "utf8").catch(() => undefined);
    if (text !== undefined) published.push(...publishGuardViolations(body.file, text));
  }
}
if (published.length) {
  console.error("Harness publication guard blocked this gh call; fix the body source, then rerun:");
  for (const violation of published) console.error(`- ${violation}`);
  process.exit(2);
}

const invocation = parseCommitInvocation(command, cwd);
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
