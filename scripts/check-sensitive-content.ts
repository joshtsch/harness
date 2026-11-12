#!/usr/bin/env tsx
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { findSensitiveContent, findSensitiveText } from "../src/sensitive-content.js";

const exec = promisify(execFile);
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const base = args[0] === "--base";
if (base && (!args[1] || args.length > 3)) throw new Error("Usage: pnpm check:sensitive [--base <base-ref> [head-ref] | <file>...]");
const scope = base ? "committed changes" : args.length ? args.join(", ") : "staged changes";
// Resolve refs first: reject option injection and invalid/missing CI bases.
const resolveRef = async (ref: string): Promise<string> => (await exec("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])).stdout.trim();
const diff = async (range: string[]) => (await exec("git", ["diff", ...range, "--no-ext-diff", "--no-textconv", "--binary", "--unified=0"], { maxBuffer: 32 * 1024 * 1024 })).stdout;
// Files, such as an issue or change-request body, are scanned whole.
const findings = base
  ? findSensitiveContent(await diff([`${await resolveRef(args[1]!)}...${await resolveRef(args[2] ?? "HEAD")}`]))
  : args.length
    ? (await Promise.all(args.map(async (path) => findSensitiveText(await readFile(path, "utf8"))))).flat()
    : findSensitiveContent(await diff(["--cached"]));

if (findings.length > 0) {
  console.error(`Sensitive content detected in ${scope}:`);
  for (const finding of findings) console.error(`- likely ${finding.kind} detected; inspect the ${scope} locally`);
  console.error("Remove the data or move it to an approved external secret/PII store before committing.");
  process.exitCode = 1;
} else {
  console.log(`No likely secrets or PII detected in ${scope}.`);
}
