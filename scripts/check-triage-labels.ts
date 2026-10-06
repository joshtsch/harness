import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { triageViolations, type IssueLabels } from "../src/triage-labels.js";

const execFileAsync = promisify(execFile);

async function run(): Promise<void> {
  const { stdout } = await execFileAsync("gh", [
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    "1000",
    "--json",
    "number,title,labels",
  ]);
  const issues = JSON.parse(stdout) as Array<Omit<IssueLabels, "labels"> & { labels: Array<{ name: string }> }>;
  const violations = issues.flatMap((issue) => triageViolations({
    number: issue.number,
    title: issue.title,
    labels: issue.labels.map((label) => label.name),
  }).map((violation) => `#${issue.number} ${issue.title}: ${violation}`));

  if (violations.length > 0) throw new Error(violations.join("\n"));
  console.log(`Triage labels pass for ${issues.length} open issue${issues.length === 1 ? "" : "s"}.`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
