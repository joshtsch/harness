import type { IssueTracker } from "./project-config.js";
import { epicLabel, intakeLabel, planningReadinessLabel } from "./triage-labels.js";

export interface ResolvedIssue {
  key: string;
  number: number;
  title: string;
  repository: string;
}

export type IssueCommandRunner = (command: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

// Work may start only from an open, triaged deliverable issue.
export function issueStartViolations(issue: { key: string; state: string; labels: readonly string[] }): string[] {
  if (issue.state !== "OPEN") return [`issue ${issue.key} is ${issue.state.toLowerCase()}; start from an open issue`];
  if (issue.labels.includes(epicLabel) || issue.labels.includes(planningReadinessLabel)) return [`issue ${issue.key} is a planning epic; start the session from a deliverable sub-issue`];
  if (issue.labels.includes(intakeLabel)) return [`issue ${issue.key} is needs-triage; triage it before starting work`];
  if (!issue.labels.includes("ready-for-agent") && !issue.labels.includes("ready-for-human")) return [`issue ${issue.key} has no ready-for-agent or ready-for-human label; triage it before starting work`];
  return [];
}

// A PR must come from `<provider>/<n>-<slug>`, reference #n in its body, and #n must be open.
export function pullRequestIssueViolations(input: { branch: string; issueNumber: number | "provisional" | undefined; body: string; issueState?: string }): string[] {
  if (input.issueNumber === "provisional") return [`branch ${input.branch} is provisional; create the issue and rename the branch before opening a pull request`];
  if (input.issueNumber === undefined) return [`branch ${input.branch} must be named <claude|codex>/<issue-number>-<slug>`];
  const violations: string[] = [];
  if (input.issueState !== "OPEN") violations.push(`issue #${input.issueNumber} is not an open issue`);
  if (!new RegExp(`(?<![\\w/])#${input.issueNumber}(?!\\d)|/issues/${input.issueNumber}(?!\\d)`).test(input.body)) violations.push(`pull request body must reference #${input.issueNumber}`);
  return violations;
}

export async function resolveIssue(tracker: IssueTracker, key: string, run: IssueCommandRunner): Promise<ResolvedIssue> {
  if (tracker.type !== "github") throw new Error(`unsupported issue tracker type: ${tracker.type}`);
  if (!tracker.repository) throw new Error("GitHub issue tracker repository is required");
  const result = await run("gh", ["issue", "view", key, "--repo", tracker.repository, "--json", "number,title,state,labels"]);
  if (result.code !== 0) throw new Error(`failed to resolve issue ${key}: ${result.stderr || result.stdout || "tracker unavailable"}`);
  let issue: unknown;
  try {
    issue = JSON.parse(result.stdout);
  } catch {
    throw new Error(`failed to resolve issue ${key}: tracker returned invalid JSON`);
  }
  const parsed = issue as { number?: unknown; title?: unknown; state?: unknown; labels?: unknown };
  const requestedNumber = Number(key);
  if (typeof issue !== "object" || issue === null || typeof parsed.number !== "number" || !Number.isSafeInteger(parsed.number) || parsed.number < 1 || parsed.number !== requestedNumber || typeof parsed.title !== "string" || parsed.title.trim() === "" || typeof parsed.state !== "string" || !Array.isArray(parsed.labels) || parsed.labels.some((label) => typeof label !== "object" || label === null || typeof label.name !== "string")) {
    throw new Error(`failed to resolve issue ${key}: tracker returned incomplete issue data`);
  }
  const labels = parsed.labels.map((label: { name: string }) => label.name);
  const [violation] = issueStartViolations({ key, state: parsed.state, labels });
  if (violation) throw new Error(violation);
  return { key, number: parsed.number, title: parsed.title, repository: tracker.repository };
}
