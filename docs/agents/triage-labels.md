# Triage labels

Use canonical labels for issue type and workflow state. Every new issue enters
through `needs-triage`. Triage adds exactly one issue-type label (`bug` or
`enhancement`) and replaces `needs-triage` with exactly one readiness label when
scope and verification are complete. An epic uses `epic` and the
`ready-for-planning` state; deliverable issues use `ready-for-agent` or
`ready-for-human`. `pnpm check:triage` enforces label consistency and checks
that a planning-ready epic has a child issue. It uses GitHub sub-issues when the
API is available; otherwise, add issue references as task-list items in the epic
body (`- [ ] #123`).

| Label | Meaning | Use |
| --- | --- | --- |
| `bug` | Existing behavior fails or regresses. | Reproducible defect. |
| `enhancement` | New behavior or capability requested. | Feature or improvement. |
| `needs-triage` | Maintainer evaluation still required. | Unreviewed or ambiguous issue. |
| `ready-for-agent` | Fully specified for autonomous implementation. | Acceptance criteria, scope, and verification path are complete. |
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
bounded result, its acceptance criteria, and how to verify it. These details
inform triage; the automated check enforces labels and parent-child structure.

Use GitHub Projects to track initiatives that span multiple epics; a Project is
a planning view, not an epic issue. Use milestones for releases or date-based
targets. Use `theme:<name>` labels to group work by a recurring theme
across epics; themes do not replace parent/sub-issue relationships.

## Priority and rank

The owner's Portfolio Backlog GitHub Project board is the only priority source
for every configured project. Add each open issue to the board when it is
created or triaged. Do not use repository `priority:` labels.

| Priority | Meaning |
| --- | --- |
| `P0` | Urgent: blocks use, data, security or other work; do before anything else. |
| `P1` | High value for the current goal; do next. |
| `P2` | Normal backlog: valuable, no urgency. |
| `P3` | Low: nice to have or speculative. |
| `Unreviewed` | Not assessed yet. Unknown, never treated as low. |

Rank within a priority is the board's manual item order: higher on the board
ranks first. Reorder by dragging in a view with no sort, or with the
`updateProjectV2ItemPosition` GraphQL mutation. Read rank from the API with
`items(orderBy: {field: POSITION, direction: ASC})`; `gh project item-list`
output order is not rank. Priority and rank are independent of readiness:
labels decide whether an issue may be picked, the board decides which first.

For choosing what to work on next, route
`pnpm capabilities route <provider> backlog-select` and use the
[backlog selection skill](../../harness-skills/backlog-select/SKILL.md).
It selects an epic and a parallel slice using live priority, board ranking, and
readiness evidence. Readiness labels establish eligibility; they do not establish
priority. A selection request returns a recommendation; an implementation request
continues through the existing contribution or project-session workflow.
