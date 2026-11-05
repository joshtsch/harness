---
name: backlog-select
description: Choose the next backlog epic and a coherent slice of ready issues that can be worked in parallel. Use when asked what to work on next, to pick up backlog work, or to select a slice; accepts optional project and epic scope.
---

# Select a backlog slice

Recommend an epic and the highest-priority compatible deliverables advancing its
outcome. A slice combines mutual benefit with independent implementation and
verification. Selection is read-only: return the recommendation without changing
issues, board fields, assignments, branches, or sessions. If the user also asks
to implement it, hand off the selected deliverables to the existing development
workflow; the epic itself is not an implementation issue.

## Resolve scope

Accept `$backlog-select [--project <project>] [--epic <issue-reference>]` and
natural-language equivalents. These are skill inputs, not a new harness CLI.

Run from the harness root and load the merged inventory with
`pnpm projects --json`. Resolve the optional project against its configured
repository and issue tracker. Otherwise use the active chat's verified project
or worktree context; a chat scoped to the harness uses the harness tracker.
Ask when the current project is unclear. Stay within that project instead of
searching the portfolio for a more attractive item.

An epic URL can identify its repository; match that identity to the selected
project. Resolve a bare issue number only within the scoped tracker. Ask about
conflicting project/epic arguments, ambiguous identities, or an issue that is not
an epic. Follow the epic's real sub-issue links, including nested epics; retain
the selected parent and consider only deliverables within project scope.

## Gather live evidence

Read the selected repository's instructions and tracker guidance. For GitHub,
use `gh` as required by [tracker policy](../../docs/agents/issue-tracker.md).
Inspect open epics, child and standalone issues, acceptance criteria, comments, dependencies,
linked change requests, and current work before choosing. Validate applicable
[triage rules](../../docs/agents/triage-labels.md), including `pnpm check:triage`
for the harness. Report unrelated triage failures separately; independently
validate every proposed issue rather than treating a global failure as a pass.

The harness priority scale and rank rule are in
[triage labels](../../docs/agents/triage-labels.md#priority-and-rank).
Find the relevant project board and planning view from project guidance,
repository links, and issue memberships. A portfolio board may be relevant, but
filter it to the selected project. Inspect its priority field, priority meanings,
rank field or saved view ordering, status, iteration/milestone, and deadlines.
Read all candidate pages; API limits and hidden filters must not silently define
the candidate pool. Keep retrieval within the project's access and data scope.

For GitHub Projects, consult installed `gh project --help`, read-only commands
such as `field-list` and `item-list`, and the
[CLI reference](https://cli.github.com/manual/gh_project_item-list).
Use supported read-only API queries or an authorized board view when needed.
A list's API return order, issue number, column order, and issue creation date
are not evidence of board rank. Verify the saved view, sort direction, grouping,
and manual order before comparing positions; positions in different groups are
not automatically comparable. See GitHub's
[board layout guidance](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-board-layout).

If no board exists after successful discovery, use explicit issue priority and
planning evidence and disclose that board rank is unavailable. An inaccessible
board is not an absent board. Ask about access failures, conflicting relevant
board/view rankings, or unclear priority meanings before final selection.
If a board exists but has no priority or ranking signal, report that absence and
use remaining evidence. Missing priority stays unknown, never silently low;
ask if the unknown value could change the winner. Distinguish an incomplete
query from evidence that a field or item is absent.

## Filter and rank

Separate epic planning readiness from deliverable implementation readiness.
A candidate epic must be open and planning-ready under repository policy, with
at least one eligible descendant. Deliverables must be open, ready for autonomous
implementation, scoped, and verifiable with available access. For canonical
harness labels this means `ready-for-agent` with valid type/readiness labels;
exclude `needs-triage`, `ready-for-human`, epics, blocked or deferred work, and
items already being implemented. Confirm actual status through linked work;
an assignee alone does not prove active implementation.

Check dependency state and recent comments even when a readiness label exists.
An unresolved prerequisite excludes a dependent from the current parallel slice.
Unknown material dependencies, unclear acceptance criteria, or unavailable
verification need resolution before treating an item as ready.

Rank eligible epics first when none was specified, then their deliverables:

1. Honor explicit user scope and selection instructions.
2. Compare explicit priority using the project's documented priority scale.
3. Within equal priority, compare verified board rank in the relevant view.
4. For ties or absent signals, compare deadline urgency, impact on the epic's
   outcome, downstream work unlocked, delivery risk, effort, and verification
   confidence. Prefer a bounded result over speculative breadth; use oldest
   creation time and stable issue reference only as final tie-breakers.

Apply epic priority to choosing the epic and deliverable priority to choosing its
issues; record the source of each rather than inventing inherited priorities.
Do not average priorities, manufacture a numeric score, or let small effort or
cohesion silently outrank explicit priority and board rank. Explain why a
higher-ranked epic or issue was skipped. A specified epic remains fixed even if
another epic has higher priority; if it has no eligible work, report that result.

When no epic was supplied and no suitable epic has eligible descendants, select
from eligible standalone issues in the current project. Flag the missing suitable
epic explicitly; do not create one, invent parentage, or pull issues from an
ineligible epic into the standalone pool. Apply the same priority and board-rank
ordering to standalone candidates. A supplied epic never falls back silently.

## Form the slice

Anchor the slice on the highest-ranked eligible deliverable in the chosen epic,
or the standalone pool when using the missing-epic fallback.
Consider remaining candidates in rank order. Include an item only when it
contributes to the same concrete outcome, adds complementary value, and can
proceed alongside every selected item on the current base. Shared theme alone
is insufficient evidence of mutual benefit.

Choose the smallest coherent group that delivers a useful combined outcome;
there is no fixed issue-count limit. State that outcome before adding partners,
and stop once it is covered. Add only the complementary issues needed for it,
rather than every related parallel candidate. Keep the highest-ranked eligible
anchor; skip lower-ranked partners only for a stated cohesion, compatibility, or
minimality reason. A single issue is valid when no useful compatible partner
exists; disclose that it offers no parallel work. Return no ready slice if the
anchor itself cannot be selected safely.

Check issue scope and the relevant code/interface boundaries for competing edits,
shared schema or contract changes, exclusive environments, and verification
coupling. Record independent ownership boundaries and verification paths.
Check that the combined behavior stays compatible: an issue documenting the
current contract may conflict with another changing it, even in separate files.
Separate worktrees do not remove logical dependencies or integration conflicts.
Two items that require one another's unmerged changes belong in successive
slices. Explain skipped incompatible items rather than labeling them parallel.

## Return the selection

Lead with the selected epic link, or the missing-epic fallback, and the slice's
shared outcome. Explain why the group is sufficient and minimal. For each selected
issue give its link, observed priority and source, board rank/view or absence,
contribution, independent work boundary, and verification path. Include concise
reasons for excluded higher-ranked options, dependencies left for later, and
uncertainties. Cite tracker/board evidence with the observation date; distinguish
observed facts from estimates. Keep private board identifiers and source payloads
out of tracked artifacts.

Return a clear no-ready-slice result when nothing qualifies, or the smallest
blocking question when evidence prevents selection. Selection alone authorizes
no tracker writes or implementation. An explicit request to work on the slice
continues through [contributing](../../docs/agents/contributing.md) for harness
changes or [session setup](../../docs/agents/session-lifecycle.md) for projects,
using each deliverable's issue identity and preserving the proposed boundaries.
