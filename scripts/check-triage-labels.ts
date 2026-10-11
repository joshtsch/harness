import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { epicLabel, planningReadinessLabel, readinessLabels, triageViolations, type IssueLabels } from "../src/triage-labels.js";

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
  const repositoryIssues = issues.filter((issue) => {
    const labels = issue.labels.map((label) => label.name);
    const hasReadiness = labels.some((label) => readinessLabels.some((readinessLabel) => readinessLabel === label));
    return labels.includes(planningReadinessLabel) || (labels.includes(epicLabel) && hasReadiness);
  });
  const subIssueCounts = new Map<number, number>();
  if (repositoryIssues.length > 0) {
    const { stdout: repository } = await execFileAsync("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
    for (const issue of repositoryIssues) {
      const { stdout: count } = await execFileAsync("gh", ["api", `repos/${repository.trim()}/issues/${issue.number}/sub_issues`, "--jq", "length"]);
      const subIssueCount = Number(count.trim());
      if (!Number.isSafeInteger(subIssueCount) || subIssueCount < 0) {
        throw new Error(`GitHub returned an invalid sub-issue count for #${issue.number}`);
      }
      subIssueCounts.set(issue.number, subIssueCount);
    }
  }
  const violations = issues.flatMap((issue) => {
    const labels = issue.labels.map((label) => label.name);
    return triageViolations({
      number: issue.number,
      title: issue.title,
      labels,
      ...(subIssueCounts.has(issue.number) ? { subIssueCount: subIssueCounts.get(issue.number) } : {}),
    }).map((violation) => `#${issue.number} ${issue.title}: ${violation}`);
  });

  if (violations.length > 0) throw new Error(violations.join("\n"));
  console.log(`Triage labels pass for ${issues.length} open issue${issues.length === 1 ? "" : "s"}.`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
