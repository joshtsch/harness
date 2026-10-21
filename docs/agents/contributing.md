# Harness Contribution Workflow

Use [Completing a Session](session-completion.md) before reporting harness or
project work complete.

Harness changes are developed on feature branches, never directly on `main`.

1. Run the [repository-scope gate](repository-intake.md) before provisioning any repository or creating any issue, branch, or worktree. Inventory every repository the session may modify, classify each ownership boundary, and register every durable project in `projects.yml` or `projects.local.yml` before continuing.
2. Create or identify the originating issue in the classified repository. Record its repository and number in the work notes.
3. Fetch `origin/main`, then fast-forward the local `main` to it. Stop if the local branch has diverged or contains uncommitted changes.
4. Create a feature branch using the repository's `codex/` branch convention when working through Codex, and include the issue number when the provider supports it.
5. Implement the change and run relevant tests, typechecking, and build checks.
6. Run `code-review` against `main`. The review must cover both documented standards and the originating GitHub issue or specification.
7. After every fix, rerun both review axes against the same pinned `main` fixed point. Repeat until both axes report no unresolved actionable findings. Do not open the change request while a review finding remains unresolved.
8. A finding may remain only when its documented rationale has explicit user approval. Record the finding, rationale, and approval in the review notes or change-request description; an agent cannot accept a finding on the user's behalf.
9. Open a GitHub merge request (shown as a pull request by GitHub) that links the issue and includes verification results.

If an issue tracker outage prevents issue creation, record a redacted outage handoff under `docs/.scratch/` with the intended title, attempted operation, timestamp, and exact blocker. Mark the branch provisional; do not push or open a merge request until the issue is created and linked. A local commit is allowed only when the user explicitly authorizes a provisional commit, and it must not be presented as review-ready.

Do not open a merge request before the review loop is complete: the final full review must use the original fixed point, cover both axes, and have no unresolved actionable findings. Any accepted finding must include its rationale and explicit user approval. Do not push directly to `main` or use the harness CLI to manage the harness repository itself.

## Completion rule

Requests to pick up, work on, or implement a backlog issue are end-to-end development requests. Selecting an issue or producing a locally verified patch is an intermediate state, not completion. Continue through the iterative two-axis review loop and open the merge request only after both axes have no unresolved actionable findings (or every accepted finding has a documented rationale and explicit user approval) and all required checks pass. Report completion only after the merge request exists, or state the exact blocker and next required action.
