# Backlog Management

Use this policy for every configured project's issue backlog. The harness sets
shared minimums; a project may keep additional standards and labels when they
do not conflict with those minimums.

## Priority

Track priority in the portfolio GitHub Project's `Priority` field. Use one of
`Unreviewed`, `P0`, `P1`, `P2`, or `P3` for every open issue. Priority describes
the urgency and value of the outcome, not issue readiness or implementation
effort. A blank field on a newly auto-added issue also means `Unreviewed` until
the next audit records an explicit value.

| Value | Meaning |
| --- | --- |
| `P0` | Active incident, serious security, privacy, or data-loss risk, or an immovable deadline that needs immediate action. |
| `P1` | Critical near-term outcome or dependency. |
| `P2` | Important planned outcome. |
| `P3` | Useful, exploratory, or deferrable work. |
| `Unreviewed` | No maintainer has assessed the issue's priority. |

Use effort only as a tie-breaker after impact, urgency, dependencies, and
confidence. Priority bands apply across projects, but do not create a strict
total order across unrelated outcomes. Maintainers own final priority. Agents
may recommend a value with evidence; they change it only after approval.
Reassess when impact, deadline, or dependencies change.

Priority is independent of issue type, readiness, and `needs-triage`. In
particular, `needs-triage` means the issue still needs shaping; it says nothing
about whether a maintainer has assessed its priority. `Unreviewed` can coexist
with any readiness state. See
[Triage labels](triage-labels.md) for issue type and readiness rules.

## Onboard a project

Run onboarding after project registration and repository access are complete,
before creating project issues or starting issue-bound work. Keep the project
onboarding-incomplete until approved changes have been applied and verified.

1. **Inspect** the configured repository, open issues, labels, issue templates,
   and project-owned agent guidance. Record the rule version and a safe
   inventory of issue IDs and `updatedAt` values.
2. **Dry run** the deterministic checks and human review separately. Produce a
   per-project change plan for missing harness labels, issue type/readiness
   fixes, priority recommendations, and standards conflicts. Preserve
   project-specific standards and labels; flag conflicts for a maintainer.
3. **Approve** the concrete plan with the maintainer. A prior agreement to the
   policy is not approval for a particular issue or standards edit.
4. **Apply** only approved changes. Keep each change scoped to the registered
   repository and approved issue IDs.
5. **Verify** the resulting labels, issue states, project fields, and standards
   against the same rules. Mark onboarding complete only when every approved
   change passes verification and every unresolved conflict is recorded.

If a project rule or issue changes after the dry run, or the rule version
changes, mark that plan stale and generate a fresh dry run before applying it.
Record a rejection or deferral as a maintainer decision; do not treat it as
successful onboarding.

## Run a backlog sweep

Run a sweep for one project or all configured projects. Repeat it on request,
when project standards change, and when harness backlog rules change. A sweep
never changes issue state or standards by itself.

Report deterministic findings separately from human review suggestions.
Deterministic findings cover:

- each open issue having exactly one issue type (`bug` or `enhancement`);
- each open issue having exactly one intake/readiness state (`needs-triage` or
  one readiness label), with readiness consistent with issue type and epic use;
- each planning-ready epic having at least one child issue;
- every open issue appearing in the portfolio project with either a valid
  `Priority` value or a blank field treated as `Unreviewed`; and
- every configured repository exposing the harness minimum labels while
  retaining its project-specific labels.

Human review suggestions cover priority, stale or blocked work, missing or
unclear outcomes, dependency order, duplicate issues, epic decomposition, and
project-standard conflicts. Suggestions include a brief reason and supporting
issue references. A suggestion is not a finding that the harness can safely
resolve without a maintainer.

Compare each run with the previous run for new, resolved, and continuing
findings. Keep portable run history in a harness-scope secure record. Store the
run timestamp, rule version, scope, issue identifiers, finding codes, and
redacted summaries. Never store raw issue bodies, comments, secrets, or PII.
Use `docs/.scratch/` only for temporary working files, not as the history
authority.

## Portfolio view

Maintain one private GitHub Project for all configured issue trackers. Include
open issues from every configured repository and configure future open issues
to enter automatically. Backfill existing issues when setting up auto-add;
GitHub does not backfill issues that already match an auto-add filter.

Use a `Priority` single-select field with the values above. Keep two portfolio
views: one grouped by priority and sorted by repository, and one grouped by
repository and sorted by priority. Add an `Unreviewed` view that includes blank
and `Unreviewed` values, and an `Epics` view filtered to the `epic` label.
Grouping provides shared bands for comparison without ranking unrelated
projects in one strict sequence. Keep issue content in its source repository;
the Project is a planning view, not an epic or source of issue truth.

The project, fields, views, and item links are external GitHub state. Before
writing them, complete the [Terraform coverage gate](infrastructure.md#terraform-coverage-gate)
and record why GitHub Projects v2 requires a scoped fallback. The coverage
check on October 11, 2026 found no Projects v2 resource in `integrations/github`
provider 6.13.0. Its classic project, column, and card resources are deprecated
because GitHub removed the Projects classic REST API. Use `gh` and the Projects
GraphQL API for supported v2 operations. GitHub's built-in auto-add workflow is
configured in the Project UI and its repository limit may be below the
portfolio's eight repositories. The approved fallback is one repository-local
workflow in every configured repository, using GitHub-maintained
`actions/add-to-project` pinned to a full commit SHA. Listen for `issues` events
`opened`, `reopened`, and `transferred`. Keep the project URL and token in
repository secrets named `PORTFOLIO_PROJECT_URL` and
`PORTFOLIO_PROJECT_TOKEN`; never put either value in tracked files. Use a
fine-grained token scoped to the portfolio project with project read/write and
the source repositories' issue read access. Do not grant repository
`GITHUB_TOKEN` permissions to the workflow. Adding an existing item is
idempotent. Configure both secrets in all eight repositories before relying on
the workflows. Existing issues require a one-time backfill because auto-add
does not add items that already match its filter. Keep the Project private and
limit writes to its fields, views, item links, and approved open-issue auto-add
rules.

Sources: [Terraform GitHub provider 6.13.0](https://registry.terraform.io/providers/integrations/github/6.13.0/docs), [deprecated classic project resource](https://registry.terraform.io/providers/integrations/github/6.13.0/docs/resources/repository_project), [GitHub Projects GraphQL API](https://docs.github.com/en/graphql/reference/projects), [GitHub auto-add workflows and plan limits](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically), [GitHub Actions project automation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions), [actions/add-to-project](https://github.com/actions/add-to-project).
