export const issueTypeLabels = ["bug", "enhancement"] as const;
export const planningReadinessLabel = "ready-for-planning" as const;
export const readinessLabels = ["ready-for-agent", "ready-for-human", planningReadinessLabel] as const;
export const intakeLabel = "needs-triage" as const;
export const epicLabel = "wayfinder:epic" as const;

export interface IssueLabels {
  number: number;
  title: string;
  labels: readonly string[];
  subIssueCount?: number;
}

export function countTaskListIssueReferences(body: string, parentIssueNumber: number): number {
  const references = body.matchAll(/^\s*[-*]\s+\[[ xX]\]\s+#(\d+)\b/gm);
  return new Set(Array.from(references, (match) => match[1]).filter((number) => Number(number) !== parentIssueNumber)).size;
}

export async function resolveChildIssueCount(
  issueNumber: number,
  body: string,
  querySubIssues: () => Promise<number>,
): Promise<number> {
  try {
    const count = await querySubIssues();
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`GitHub returned an invalid sub-issue count for #${issueNumber}`);
    }
    return count;
  } catch (error) {
    const details = error as Error & { stderr?: string };
    const diagnostic = details.stderr?.trim() || details.message || String(error);
    if (/HTTP 404\b|404 Not Found\b/i.test(diagnostic)) {
      return countTaskListIssueReferences(body, issueNumber);
    }
    throw new Error(`Cannot query sub-issues for #${issueNumber}: ${diagnostic}`);
  }
}

export function triageViolations(issue: IssueLabels): string[] {
  const types = issueTypeLabels.filter((label) => issue.labels.includes(label));
  const readiness = readinessLabels.filter((label) => issue.labels.includes(label));
  const needsTriage = issue.labels.includes(intakeLabel);
  const isEpic = issue.labels.includes(epicLabel);
  const violations: string[] = [];

  if (types.length > 1) violations.push("has multiple issue-type labels");
  if (readiness.length > 1) violations.push("has multiple readiness labels");
  if (needsTriage && readiness.length > 0) violations.push("cannot be needs-triage and ready");
  if (readiness.length > 0 && types.length !== 1) violations.push("ready issue must have one issue-type label");
  if (types.length === 0 && !needsTriage) violations.push("has no issue-type or needs-triage label");
  if (readiness.length === 0 && !needsTriage) violations.push("has no readiness label");
  if (issue.labels.includes(planningReadinessLabel) && !isEpic) violations.push("ready-for-planning issue must have the wayfinder:epic label");
  if (isEpic && issue.labels.includes("ready-for-agent")) {
    violations.push("epic cannot be ready-for-agent");
  } else if (isEpic && readiness.length > 0 && !issue.labels.includes(planningReadinessLabel)) {
    violations.push("epic must use ready-for-planning instead of a deliverable readiness label");
  }
  if (isEpic && readiness.length > 0 && (issue.subIssueCount ?? 0) < 1) {
    violations.push("ready epic must have at least one sub-issue");
  }

  return violations;
}
