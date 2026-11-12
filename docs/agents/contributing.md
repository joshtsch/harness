# Harness Contribution Workflow

Use [Completing a Session](session-completion.md) before reporting harness or
project work complete.

Harness changes are developed on feature branches, never directly on `main`.

1. Run the [repository-scope gate](repository-intake.md) before provisioning any repository or creating any issue, branch, or worktree. Inventory every repository the session may modify, classify each ownership boundary, and register every durable project in `projects.yml` or `projects.local.yml` before continuing.
2. Create or identify the originating issue in the classified repository. Record its repository and number in the work notes.
3. Fetch `origin/main`, then fast-forward the local `main` to it. Stop if the local branch has diverged or contains uncommitted changes.
4. Create a feature branch using the repository's provider prefix, `codex/` through Codex or `claude/` through Claude Code, and include the issue number when the provider supports it.
5. Implement the change and run relevant tests, typechecking, and build checks.
6. Run `code-review` against `main`. The review must cover both documented standards and the originating GitHub issue or specification.
7. Resolve or explicitly accept review findings.
8. Commit on the feature branch and run the [paired review loop](session-completion.md#5a-run-the-paired-review-loop) against the local branch until the review session reports no unresolved findings, or the user declines it.
9. Open a GitHub merge request (shown as a pull request by GitHub) that links the issue and includes verification results and the paired review outcome.

If an issue tracker outage prevents issue creation, record a redacted outage handoff under `docs/.scratch/` with the intended title, attempted operation, timestamp, and exact blocker. Mark the branch provisional; do not push or open a merge request until the issue is created and linked. A local commit is allowed only when the user explicitly authorizes a provisional commit, and it must not be presented as review-ready.

Do not open a merge request before the review is complete. Do not push directly to `main` or use the harness CLI to manage the harness repository itself.

## Completion rule

Requests to pick up, work on, or implement a backlog issue are end-to-end development requests. Selecting an issue or producing a locally verified patch is an intermediate state, not completion. Continue through the review loop and open the merge request after all review gates pass. Report completion only after the merge request exists, or state the exact blocker and next required action.

## Executable CI and required checks

The `Harness quality` workflow runs tests, typecheck, build, documentation policy,
changed Markdown validation, the capability inventory check, and
sensitive-content scanning on committed PR changes. The runner installs `age` for the existing encryption integration tests. Required failures fail the job. CI uses the PR base and head commits;
it never treats an empty staging area as evidence that PR changes were scanned.
Local `pnpm check:sensitive` continues to scan the staging area. Use
`pnpm check:sensitive --base <base-ref> [head-ref]` for committed changes, or
`pnpm check:sensitive -- <file>` for a file such as a publication body.

Portfolio `check:triage` and host `check:prereqs` stay separate from code-quality
CI: disclose unrelated triage failures during completion. Branch protection is
managed by `infrastructure/branch-protection.tf` in the existing harness HCP
workspace. A committed workflow or Terraform resource does not prove protection
is active; verify provider state and the actual PR check. Apply only a reviewed,
in-scope Terraform plan. See [infrastructure setup](../../infrastructure/README.md#required-ci-protection).
