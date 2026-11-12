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

A project has Storybook when any `package.json` has a `storybook` script or a
`@storybook/*` dependency, or the repository has a `.storybook/` folder. A
project has a user interface when any `package.json` depends on `react`,
`react-native`, `next`, `vue` or `svelte`. `pnpm standards local` applies both
rules and warns, as an optional failure, when a project has a user interface
but no Storybook. `pnpm standards bootstrap` skips this check, because Storybook
follows the first UI rather than the scaffold.

When a project has Storybook, a change that adds or changes a UI element adds or
updates stories that cover it and each of its meaningful states, as defined in
[projects with a user interface](project-configuration.md#projects-with-a-user-interface).
Implementation and review sessions both ask: stories added or updated for every
UI element touched?

When a project has a user interface but no Storybook, do not skip the check.
Implementation sessions report the missing Storybook as a blocker in the
completion report, and review sessions raise it as a standards finding. Either
session proposes a separate issue to adopt Storybook instead of setting it up
inside an unrelated change.

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
[Agent Context](../../CONTEXT.md#agent-context). Run it with the
[`paired-review` skill](../../harness-skills/paired-review/SKILL.md), which
holds the review prompt.

The review runs before the change request opens:

1. The implementation session runs the change locally, commits it on the
   feature branch, and then offers the user a paired review session against the
   local branch. It starts the session only on the user's yes. If the user
   declines, the review gate in [section 3](#3-verify-and-review) still
   applies, the change request may open, and both the change request and the
   completion report note that the paired review was declined.
2. The review session reviews the branch on both
   [review axes](architecture.md): repository standards and the originating
   issue or specification, including the [UI stories](#ui-stories) check. An
   unpushed branch is reviewed from its worktree path with
   `git diff main...HEAD`. It sends its findings to the originating
   implementation session without asking the user, and states when none remain.
3. The implementation session fixes or explicitly accepts each finding. After
   each fix commit, it requests another review from the same review session and
   sends the accepted findings with its reasons, so the review session treats
   them as resolved.
4. When the review session reports no unresolved findings, the implementation
   session opens the change request and records the review outcome in it: clean,
   or the accepted findings with their reasons.
5. After any later push to an open change request, the implementation session
   requests another review from the same review session and repeats steps 3–4,
   updating the recorded outcome.

When the provider cannot start or message sessions, give the user the review
prompt and relay findings manually.

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
