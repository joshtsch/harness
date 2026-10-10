import { findSensitiveContent } from "../sensitive-content.js";

export interface SessionInput {
  projectList: string;
  issueKey: string;
  goal: string;
}

const usage = "Usage: pnpm setup:session [--refresh] --goal <goal> <project-a,project-b> <issue-number>";

export function parseSessionArgs(args: string[]): SessionInput {
  if (args.filter((arg) => arg === "--refresh").length > 1) throw new Error(usage);
  if (args.filter((arg) => arg === "--goal").length !== 1) throw new Error(usage);
  const goalIndex = args.indexOf("--goal");
  const rawGoal = args[goalIndex + 1];
  const goal = rawGoal?.trim();
  if (!goal || goal.startsWith("--") || goal.length > 1000 || /[\u0000-\u001f\u007f]/.test(rawGoal)) throw new Error("goal must be one non-empty line of at most 1000 characters");
  if (findSensitiveContent(`+${goal}`).length > 0) throw new Error("goal must not contain likely secrets or PII");
  const positional = args.filter((arg, index) => arg !== "--refresh" && index !== goalIndex && index !== goalIndex + 1);
  const [projectList, second, third, ...extra] = positional;
  if (!projectList || !second || extra.length > 0) throw new Error(usage);
  if (second === "--exploratory") throw new Error("issue number required; open a tracker issue before implementation");
  if (third) throw new Error(usage);
  const issueNumber = Number(second);
  if (!/^\d+$/.test(second) || !Number.isSafeInteger(issueNumber) || issueNumber < 1 || String(issueNumber) !== second) throw new Error("issue key must be a canonical positive GitHub issue number");
  return { projectList, issueKey: second, goal };
}
