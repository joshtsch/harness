#!/usr/bin/env tsx
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { findSensitiveContent } from "../src/sensitive-content.js";

const exec = promisify(execFile);
const { stdout } = await exec("git", ["diff", "--cached", "--binary", "--unified=0"]);
const findings = findSensitiveContent(stdout);

if (findings.length > 0) {
  console.error("Sensitive content detected in staged changes:");
  for (const finding of findings) console.error(`- likely ${finding.kind} detected; inspect the staged diff locally`);
  console.error("Remove the data or move it to an approved external secret/PII store before committing.");
  process.exitCode = 1;
} else {
  console.log("No likely secrets or PII detected in staged changes.");
}
