import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { markdownViolations } from "../src/markdown-policy.js";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const paths = args.filter((arg) => arg !== "--stdin");

async function check(path: string, source: string): Promise<string[]> {
  return markdownViolations(source).map(({ line, message }) => `${path}:${line}: ${message}`);
}

async function run(): Promise<void> {
  const findings = args.includes("--stdin")
    ? await check("stdin", await new Promise<string>((resolveInput, reject) => {
      let source = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { source += chunk; });
      process.stdin.on("end", () => resolveInput(source));
      process.stdin.on("error", reject);
    }))
    : (paths.length === 0 ? ["pass a markdown path or use --stdin"] : (await Promise.all(paths.map(async (path) => check(path, await readFile(resolve(path), "utf8"))))).flat());

  if (findings.length > 0) throw new Error(findings.join("\n"));
  console.log("Markdown passes publication checks.");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
