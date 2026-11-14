# Triage labels

Use canonical labels for issue type and workflow state. Every new issue enters
through `needs-triage`. Triage adds exactly one issue-type label (`bug` or
`enhancement`) and replaces `needs-triage` with exactly one readiness label when
scope and verification are complete. An epic uses `epic` and the
`ready-for-planning` state; deliverable issues use `ready-for-agent` or
`ready-for-human`. `pnpm check:triage` checks label consistency and
that a planning-ready epic has a child issue and that every `ready-for-agent`
issue has Gherkin acceptance criteria. It uses GitHub sub-issues when the
API is available; otherwise, add issue references as task-list items in the epic
body (`- [ ] #123`). To check another repository from the harness root, set
`GH_REPO=owner/name`; issues and sub-issues both resolve from it.

| Label | Meaning | Use |
| --- | --- | --- |
| `bug` | Existing behavior fails or regresses. | Reproducible defect. |
| `enhancement` | New behavior or capability requested. | Feature or improvement. |
| `needs-triage` | Maintainer evaluation still required. | Unreviewed or ambiguous issue. |
| `ready-for-agent` | Fully specified for autonomous implementation. | Gherkin acceptance criteria, scope, and verification path are complete. |
| `ready-for-human` | Requires human implementation or decision. | Needs unavailable access, judgment, or coordination. |
| `ready-for-planning` | Epic is ready to plan and track. | The only readiness state for epics; requires `epic` and at least one child issue. |
| `epic` | Parent issue for a larger outcome. | Group related deliverable issues using GitHub sub-issues. |

Typical deliverable flow: new issue -> `needs-triage` -> `ready-for-agent` or
`ready-for-human`. Epic flow: new issue -> `needs-triage` -> `epic` ->
add at least one child issue -> `ready-for-planning`. An epic cannot be
`ready-for-agent` or `ready-for-human`; start implementation sessions from its
deliverable issues.
`ready-for-planning` is valid only on epics. Keep `needs-triage` for unreviewed
or ambiguous issues; it cannot coexist with any readiness label.

Write epics around an outcome, why it matters, acceptance criteria, scope and
non-goals, and known dependencies or risks. Write deliverable issues around one
bounded result, its acceptance criteria, and how to verify it. A
`ready-for-agent` issue states its acceptance criteria in Gherkin: at least one
`Scenario:` (or `Scenario Outline:`) with `Given`, `When`, and `Then` steps,
each step starting its own line, plain or as a heading, blockquote, bullet,
numbered, or task-list item (a fenced `gherkin` block works).
`pnpm check:triage` checks labels, parent-child structure, and the scenario's
presence on `ready-for-agent` issues; [session setup](session-lifecycle.md) refuses to start work on any
issue without one. Triage still judges its quality.

Use GitHub Projects to track initiatives that span multiple epics; a Project is
a planning view, not an epic issue. Use milestones for releases or date-based
targets. Use `theme:<name>` labels to group work by a recurring theme
across epics; themes do not replace parent/sub-issue relationships.

## Priority and rank

The owner's Portfolio Backlog GitHub Project board is the priority source for
configured projects. A project adopts it by putting its open issues on the
board and retiring repository `priority:` labels; after that, add each new issue
to the board when it is triaged. A project with no board items has not adopted
it yet, so its issues are not `Unreviewed`.

| Priority | Meaning |
| --- | --- |
| `P0` | Urgent: breaks use, risks data loss or security, or blocks other work; do before anything else. |
| `P1` | High value for the current goal; do next. |
| `P2` | Normal backlog: valuable, no urgency. |
| `P3` | Low: nice to have or speculative. |
| `Unreviewed` | Priority not assessed yet; unknown, never treated as low. Separate from the `needs-triage` label, which is about readiness. |

Rank within a priority is the board's manual item order: higher on the board
ranks first. Reorder by dragging in a view with no sort, or with the
`updateProjectV2ItemPosition` GraphQL mutation. Read rank from the API with
`items(orderBy: {field: POSITION, direction: ASC})`. Priority and rank are independent of readiness:
labels decide whether an issue may be picked, the board decides which first.

For choosing what to work on next, route
`pnpm capabilities route <provider> backlog-select` and use the
[backlog selection skill](../../harness-skills/backlog-select/SKILL.md).
It selects an epic and a parallel slice using live priority, board ranking, and
readiness evidence. Readiness labels establish eligibility; they do not establish
priority. A selection request returns a recommendation; an implementation request
continues through the existing contribution or project-session workflow.
