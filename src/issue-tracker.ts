import type { IssueTracker } from "./project-config.js";
import { epicLabel, hasGherkinAcceptanceCriteria, intakeLabel, planningReadinessLabel, triageViolations } from "./triage-labels.js";

export interface ResolvedIssue {
  key: string;
  number: number;
  title: string;
  repository: string;
}

// Tasks filed from this date on must belong to an epic; older standalone issues are exempt.
export const epicRequiredSince = "2026-11-14T00:00:00Z";

export type IssueCommandRunner = (command: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

export async function resolveIssue(tracker: IssueTracker, key: string, run: IssueCommandRunner): Promise<ResolvedIssue> {
  if (tracker.type !== "github") throw new Error(`unsupported issue tracker type: ${tracker.type}`);
  if (!tracker.repository) throw new Error("GitHub issue tracker repository is required");
  if (!/^[1-9]\d*$/.test(key)) throw new Error(`failed to resolve issue ${key}: issue key must be a number`);
  const result = await run("gh", ["api", `repos/${tracker.repository}/issues/${key}`]);
  if (result.code !== 0) throw new Error(`failed to resolve issue ${key}: ${result.stderr || result.stdout || "tracker unavailable"}`);
  let issue: unknown;
  try {
    issue = JSON.parse(result.stdout);
  } catch {
    throw new Error(`failed to resolve issue ${key}: tracker returned invalid JSON`);
  }
  const parsed = issue as { number?: unknown; title?: unknown; labels?: unknown; body?: unknown; pull_request?: unknown; created_at?: unknown; parent_issue_url?: unknown; sub_issues_summary?: { total?: unknown; completed?: unknown } };
  const requestedNumber = Number(key);
  if (typeof issue !== "object" || issue === null || typeof parsed.number !== "number" || !Number.isSafeInteger(parsed.number) || parsed.number < 1 || parsed.number !== requestedNumber || typeof parsed.title !== "string" || parsed.title.trim() === "" || !Array.isArray(parsed.labels) || parsed.labels.some((label) => typeof label !== "object" || label === null || typeof label.name !== "string")) {
    throw new Error(`failed to resolve issue ${key}: tracker returned incomplete issue data`);
  }
  if (parsed.pull_request !== undefined) throw new Error(`issue ${key} is a pull request; start the session from an issue`);
  const labels = parsed.labels.map((label: { name: string }) => label.name);
  if (labels.includes(epicLabel) || labels.includes(planningReadinessLabel)) {
    throw new Error(`issue ${key} is a planning epic; start the session from a deliverable sub-issue`);
  }
  const body = typeof parsed.body === "string" ? parsed.body : "";
  if (!hasGherkinAcceptanceCriteria(body)) {
    throw new Error(`issue ${key} has no Gherkin acceptance criteria. Before starting, offer the user a Scenario with Given/When/Then steps for this issue, add it to the issue once they agree, then rerun setup.`);
  }
  const violations = triageViolations({ number: parsed.number, title: parsed.title, labels, body });
  if (labels.includes(intakeLabel)) violations.push("needs-triage issue is not ready to start");
  // parent_issue_url is absent where the tracker has no sub-issues; only null means unlinked.
  if (parsed.parent_issue_url === null && typeof parsed.created_at === "string" && parsed.created_at >= epicRequiredSince) {
    violations.push("has no parent epic; link it under an open epic (gh issue list --label epic), or file one if none fits");
  }
  const { total, completed } = parsed.sub_issues_summary ?? {};
  if (typeof total === "number" && typeof completed === "number" && total > completed) {
    violations.push("has open subtasks; start the session from one of them");
  }
  if (violations.length > 0) {
    throw new Error(`issue ${key} fails triage: ${violations.join("; ")}. Fix it per docs/agents/triage-labels.md#shaping-tracker-work, then rerun setup.`);
  }
  return { key, number: parsed.number, title: parsed.title, repository: tracker.repository };
}
