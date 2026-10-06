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

## 4. Ingest durable knowledge into wikis

Before reporting completion, check whether the session produced reusable
research, decisions, source material, or workflow knowledge.

- Run `pnpm wikis --json` to inventory the harness and configured child wikis.
- Compare the content with each wiki's declared topics. Route harness knowledge
  to `docs/llm-wiki-harness/`; route project knowledge to the matching child
  wiki. If coverage is unclear or multiple child wikis match, ask the user.
- Put source material in the selected wiki's `raw` path and authored synthesis
  in its `pages` path. Preserve source URLs, retrieval dates, and citations.
- Update the selected wiki's index and append its log. Keep raw source records
  immutable after ingestion; stage newly authored source captures according to
  that wiki's `AGENTS.md` unless the user explicitly requests direct ingestion.
- Verify wiki links, page reachability, source references, and sensitive-content
  rules. Include wiki changes in the corresponding harness or child-project
  commit and change request.
- If the session produced no durable knowledge, record that wiki ingestion was
  reviewed and not applicable.

This stage applies to the harness wiki and every affected sub-project wiki; it
does not require changing unrelated wikis.

## 5. Check change-request traceability

Every change request must:

- link its originating issue(s);
- summarize the intended changes;
- list verification evidence; and
- identify material omissions or known unrelated gate failures.

If a project change request has no issue link, create a redacted issue in that
project's tracker and update the change request before merging.

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
