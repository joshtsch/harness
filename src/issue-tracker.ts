import type { IssueTracker } from "./project-config.js";
import { epicLabel, planningReadinessLabel } from "./triage-labels.js";

export interface ResolvedIssue {
  key: string;
  number: number;
  title: string;
  repository: string;
}

export type IssueCommandRunner = (command: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

export async function resolveIssue(tracker: IssueTracker, key: string, run: IssueCommandRunner): Promise<ResolvedIssue> {
  if (tracker.type !== "github") throw new Error(`unsupported issue tracker type: ${tracker.type}`);
  if (!tracker.repository) throw new Error("GitHub issue tracker repository is required");
  const result = await run("gh", ["issue", "view", key, "--repo", tracker.repository, "--json", "number,title,labels"]);
  if (result.code !== 0) throw new Error(`failed to resolve issue ${key}: ${result.stderr || result.stdout || "tracker unavailable"}`);
  let issue: unknown;
  try {
    issue = JSON.parse(result.stdout);
  } catch {
    throw new Error(`failed to resolve issue ${key}: tracker returned invalid JSON`);
  }
  const parsed = issue as { number?: unknown; title?: unknown; labels?: unknown };
  const requestedNumber = Number(key);
  if (typeof issue !== "object" || issue === null || typeof parsed.number !== "number" || !Number.isSafeInteger(parsed.number) || parsed.number < 1 || parsed.number !== requestedNumber || typeof parsed.title !== "string" || parsed.title.trim() === "" || !Array.isArray(parsed.labels) || parsed.labels.some((label) => typeof label !== "object" || label === null || typeof label.name !== "string")) {
    throw new Error(`failed to resolve issue ${key}: tracker returned incomplete issue data`);
  }
  const labels = parsed.labels.map((label: { name: string }) => label.name);
  if (labels.includes(epicLabel) || labels.includes(planningReadinessLabel)) {
    throw new Error(`issue ${key} is a planning epic; start the session from a deliverable sub-issue`);
  }
  return { key, number: parsed.number, title: parsed.title, repository: tracker.repository };
}
