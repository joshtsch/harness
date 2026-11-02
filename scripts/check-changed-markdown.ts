import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { markdownViolations } from "../src/markdown-policy.js";

const exec = promisify(execFile);
const base = process.argv[2];
if (!base) throw new Error("pass the PR base commit");
const { stdout: sha } = await exec("git", ["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`]);
const { stdout } = await exec("git", ["diff", "--name-only", "--diff-filter=ACMR", "-z", `${sha.trim()}...HEAD`, "--", "*.md"]);
const findings: string[] = [];
for (const path of stdout.split("\0").filter(Boolean)) {
  findings.push(...markdownViolations(await readFile(path, "utf8")).map(({ line, message }) => `${path}:${line}: ${message}`));
}
if (findings.length) throw new Error(findings.join("\n"));
console.log("Changed Markdown passes publication checks.");
