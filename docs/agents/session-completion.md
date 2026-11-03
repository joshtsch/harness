# Completing a Session

Use this workflow before reporting a harness or project session complete.

## 1. Establish scope

- Confirm the intended repositories, branches, and change requests.
- Inspect `git status` in each repository.
- Preserve unrelated working-tree changes; modify them only when the user explicitly includes them.
- Confirm every implementation change has an issue in that repository's configured issue tracker. If an outage prevented issue creation, confirm the provisional outage handoff exists and keep the work incomplete until the issue is linked.

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

### UI stories

When a project has Storybook (a `storybook` script or `@storybook/*` dependency
in `package.json`, or a `.storybook/` folder), a change that adds or changes a UI
element adds or updates stories that cover it and each of its meaningful states,
as defined in [projects with a user interface](project-configuration.md#projects-with-a-user-interface).
Implementation and review sessions both ask: stories added or updated for every
UI element touched?

## 4. Ingest durable knowledge into wikis

Before reporting completion, check whether the session produced reusable
research, decisions, source material, or workflow knowledge.

Use `knowledge-routing` when placement is unclear, then `harness-memory` for
selected-vault capture, maintenance, and promotion checks. Memory capture follows
[dry-run-first review](harness-memory.md#dry-run-first-memory-changes); return the
unsaved proposal and await approval. An unattended completion skips capture when
no review channel exists. The
[rollout contract](harness-memory.md#migration-preview) keeps existing sources
active until approved cutover. Include resulting changes in each owning
repository's verification and change request. Report capture results, pending
unsaved review, or why durable capture was not applicable; leave unrelated vaults alone.

## 5. Check change-request traceability

Every change request must:

- link its originating issue(s);
- summarize the intended changes;
- list verification evidence; and
- identify material omissions or known unrelated gate failures.

If a project change request has no issue link, create a redacted issue in that
project's tracker and update the change request before merging.

## 5a. Run the paired review loop

This loop pairs an implementation session and a review session, as defined in
[Agent Context](../../CONTEXT.md#agent-context).

1. After opening a change request, the implementation session offers the user a
   paired review session and starts it only on the user's yes. If the user
   declines, the review gate in [section 3](#3-verify-and-review) still
   applies, and the completion report notes that the paired review was declined.
2. The review session reviews the change request against its originating issue
   and the [two-axis review standards](contributing.md), including the
   [UI stories](#ui-stories) check. It sends its findings to
   the originating implementation session without asking the user, and states
   when none remain.
3. The implementation session fixes or explicitly accepts each finding. After
   each push, it requests another review from the same review session and sends
   the accepted findings with its reasons, so the review session treats them as
   resolved.
4. The loop ends when the review session reports no unresolved findings. Record
   accepted findings in the change request.

The review prompt names the change-request link, the originating issue, the
standards to review against, and where to send findings. When the provider
cannot start or message sessions, give the user that prompt and relay findings
manually.

## 6. Merge and synchronize

- Merge only change requests that are review-ready and provider-eligible.
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

## Standards readiness evidence

Report fresh local check results separately from verified remote enforcement.
For onboarded projects, run `pnpm standards remote <project>` after the integration
commit and CI are available. For bootstrap publication, use the independent
`standards publish` gate described in [intake](repository-intake.md#local-scaffold-and-remote-standards-gates).
Never reuse old validation after changing source or configuration. A blocked or
unsupported provider result must include its next action; do not mark protection
active merely because workflow or Terraform files exist. Verify the harness's
`Harness quality` PR job and required branch check through GitHub after changes.
