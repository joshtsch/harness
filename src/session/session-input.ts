export interface SessionInput {
  projectList: string;
  issueKey: string;
}

const usage = "Usage: pnpm setup:session [--refresh] <project-a,project-b> <issue-number>";

export function parseSessionArgs(args: string[]): SessionInput {
  if (args.filter((arg) => arg === "--refresh").length > 1) throw new Error(usage);
  const [projectList, second, third, ...extra] = args.filter((arg) => arg !== "--refresh");
  if (!projectList || !second || extra.length > 0) throw new Error(usage);
  if (second === "--exploratory") throw new Error("issue number required; open a tracker issue before implementation");
  if (third) throw new Error(usage);
  const issueNumber = Number(second);
  if (!/^\d+$/.test(second) || !Number.isSafeInteger(issueNumber) || issueNumber < 1 || String(issueNumber) !== second) throw new Error("issue key must be a canonical positive GitHub issue number");
  return { projectList, issueKey: second };
}
