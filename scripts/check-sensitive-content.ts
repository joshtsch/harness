#!/usr/bin/env tsx
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { findSensitiveContent } from "../src/sensitive-content.js";

const exec = promisify(execFile);
const usage = "Usage: pnpm check:sensitive [--staged | --base <ref>]";

async function run(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length === 1 && args[0] === "--help") { console.log(usage); return; }
  let comparison: string[];
  if (args.length === 0 || (args.length === 1 && args[0] === "--staged")) comparison = ["--cached"];
  else if (args.length === 2 && args[0] === "--base" && args[1]) {
    const { stdout } = await exec("git", ["rev-parse", "--verify", "--end-of-options", `${args[1]}^{commit}`]);
    comparison = [`${stdout.trim()}...HEAD`];
  } else throw new Error(usage);
  const { stdout } = await exec("git", ["diff", ...comparison, "--no-ext-diff", "--no-textconv", "--binary", "--unified=0", "--"], { maxBuffer: 8 * 1024 * 1024 });
  if (!stdout.trim()) { console.log("No changes to scan in the selected Git diff."); return; }
  const findings = findSensitiveContent(stdout);
  if (findings.length) {
    for (const finding of findings) console.error(`${JSON.stringify(finding.file ?? "diff")}:${finding.line}: likely ${finding.kind}; inspect locally`);
    process.exitCode = 1;
  } else console.log("No likely secrets or PII detected in the selected Git diff.");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error && error.message === usage ? usage : "Sensitive-content check failed; verify the Git reference and repository access.");
  process.exitCode = 1;
});
