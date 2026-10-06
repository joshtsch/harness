export const issueTypeLabels = ["bug", "enhancement"] as const;
export const readinessLabels = ["ready-for-agent", "ready-for-human"] as const;
export const intakeLabel = "needs-triage" as const;

export interface IssueLabels {
  number: number;
  title: string;
  labels: readonly string[];
}
export function triageViolations(issue: IssueLabels): string[] {
  const types = issueTypeLabels.filter((label) => issue.labels.includes(label));
  const readiness = readinessLabels.filter((label) => issue.labels.includes(label));
  const needsTriage = issue.labels.includes(intakeLabel);
  const violations: string[] = [];

  if (types.length > 1) violations.push("has multiple issue-type labels");
  if (readiness.length > 1) violations.push("has multiple readiness labels");
  if (needsTriage && readiness.length > 0) violations.push("cannot be needs-triage and ready");
  if (readiness.length > 0 && types.length !== 1) violations.push("ready issue must have one issue-type label");
  if (types.length === 0 && !needsTriage) violations.push("has no issue-type or needs-triage label");
  if (readiness.length === 0 && !needsTriage) violations.push("has no readiness label");

  return violations;
}
