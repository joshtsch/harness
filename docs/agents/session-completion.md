# Completing a Session

Use this workflow before reporting a harness or project session complete.

Apply these steps to the selected [contribution outcome](contributing.md#authorization-and-outcomes).
Local capture finishes with a verified local artifact and an honest publication
status; issue creation, pushing, and integration are outside that outcome.
For public contributions, complete the lifecycle below within the user's existing
authorization. Report any unapproved external step as pending, without retrying
an approval rejection through another tool.

## 1. Establish scope

- Confirm the intended repositories, branches, and change requests.
- Inspect `git status` in each repository.
- Preserve unrelated working-tree changes; modify them only when the user explicitly includes them.
- Confirm every public contribution has an issue in that repository's configured issue tracker. If an outage prevented issue creation, confirm the provisional outage handoff exists and keep the work incomplete until the issue is linked.

## 2. Commit intended work

- Review the staged diff for secrets, PII, generated artifacts, and unrelated edits.
- Run `git diff --check`.
- Commit with the originating issue reference.
- Push the branch used by the change request.

## 3. Verify and review

Run the relevant repository gates, including tests, typecheck, build,
documentation, markdown, sensitive-content, prerequisite, and issue-tracker
checks where available. Then run the required two-axis review against the
current target `main`.

Do not merge while actionable review findings remain. Record accepted findings
and user approval when an exception is necessary.

## 4. Ingest durable knowledge into wikis

Before reporting completion, check whether the session produced reusable
research, decisions, source material, or workflow knowledge.

Use `knowledge-routing` when placement is unclear, then `harness-memory` for
selected-vault capture, maintenance, and promotion checks. Its
[rollout contract](harness-memory.md#migration-preview) keeps existing sources
active until approved cutover. Include resulting changes in each owning
repository's verification and change request. Report capture results or why
durable capture was not applicable; leave unrelated vaults alone.

## 5. Check change-request traceability

Every change request must:

- link its originating issue(s);
- summarize the intended changes;
- list verification evidence; and
- identify material omissions or known unrelated gate failures.

If a project change request has no issue link, create a redacted issue in that
project's tracker and update the change request before merging.

## 6. Merge and synchronize

- Merge only change requests that are review-ready, provider-eligible, and authorized for integration.
- Fetch the target repository after merge.
- Fast-forward the local target `main` branch only when it has no unrelated
  local commits or changes.
- For child projects, update the project main clone and keep harness worktrees
  isolated from it.
- Re-run a lightweight status check after synchronization.

## 7. Report completion evidence

The final report should state:

- commit(s) and change request(s);
- originating issue(s);
- review and verification results;
- merge state;
- synchronized local `main` branches; and
- wiki-ingestion result for the harness and affected child wikis; and
- every remaining blocker or intentionally preserved local change.

Do not report the session as fully complete while a required change request is
open, an issue link is missing, or a required merge/synchronization step is
blocked.
