#!/usr/bin/env tsx
// CI check: a pull request comes from `<provider>/<n>-<slug>`, references #n, and #n is an open issue.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { harnessBranchIssue } from "../src/git-guard.js";
import { pullRequestIssueViolations } from "../src/issue-tracker.js";

const branch = process.env.PR_BRANCH ?? "";
const body = process.env.PR_BODY ?? "";
const repository = process.env.GITHUB_REPOSITORY ?? "";
const issueNumber = harnessBranchIssue(branch);
let issueState: string | undefined;
if (typeof issueNumber === "number") {
  // A missing issue or pull request number fails the gh call or returns a non-issue; both leave the state unset.
  const view = await promisify(execFile)("gh", ["issue", "view", String(issueNumber), "--repo", repository, "--json", "state,url"]).catch(() => undefined);
  const issue = view ? JSON.parse(view.stdout) as { state?: string; url?: string } : undefined;
  if (issue?.url?.includes("/issues/")) issueState = issue.state;
}
const violations = pullRequestIssueViolations({ branch, issueNumber, body, issueState });
for (const violation of violations) console.error(`::error::${violation}`);
if (violations.length) process.exitCode = 1;
