import type { IssueTracker } from "./project-config.js";

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
  const result = await run("gh", ["issue", "view", key, "--repo", tracker.repository, "--json", "number,title"]);
  if (result.code !== 0) throw new Error(`failed to resolve issue ${key}: ${result.stderr || result.stdout || "tracker unavailable"}`);
  let issue: unknown;
  try {
    issue = JSON.parse(result.stdout);
  } catch {
    throw new Error(`failed to resolve issue ${key}: tracker returned invalid JSON`);
  }
  const parsed = issue as { number?: unknown; title?: unknown };
  const requestedNumber = Number(key);
  if (typeof issue !== "object" || issue === null || typeof parsed.number !== "number" || !Number.isSafeInteger(parsed.number) || parsed.number < 1 || parsed.number !== requestedNumber || typeof parsed.title !== "string" || parsed.title.trim() === "") {
    throw new Error(`failed to resolve issue ${key}: tracker returned incomplete issue data`);
  }
  return { key, number: parsed.number, title: parsed.title, repository: tracker.repository };
}
