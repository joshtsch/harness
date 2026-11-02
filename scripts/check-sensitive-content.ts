#!/usr/bin/env tsx
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { findSensitiveContent } from "../src/sensitive-content.js";

const exec = promisify(execFile);
const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length && (args[0] !== "--base" || !args[1] || args.length > 3)) throw new Error("Usage: pnpm check:sensitive [--base <base-ref> [head-ref]]");
const scope = args.length ? "committed changes" : "staged changes";
// Resolve refs first: reject option injection and invalid/missing CI bases.
const resolveRef = async (ref: string): Promise<string> => (await exec("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])).stdout.trim();
const range = args.length ? [`${await resolveRef(args[1])}...${await resolveRef(args[2] ?? "HEAD")}`] : ["--cached"];
const { stdout } = await exec("git", ["diff", ...range, "--no-ext-diff", "--no-textconv", "--binary", "--unified=0"], { maxBuffer: 32 * 1024 * 1024 });
const findings = findSensitiveContent(stdout);

if (findings.length > 0) {
  console.error(`Sensitive content detected in ${scope}:`);
  for (const finding of findings) console.error(`- likely ${finding.kind} detected; inspect the staged diff locally`);
  console.error("Remove the data or move it to an approved external secret/PII store before committing.");
  process.exitCode = 1;
} else {
  console.log(`No likely secrets or PII detected in ${scope}.`);
}
