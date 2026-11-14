# Triage labels

Use canonical labels for issue type and workflow state. A new issue enters
through `needs-triage` unless [the user approved it](#shaping-tracker-work). Triage adds exactly one issue-type label (`bug` or
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

## Shaping tracker work

Read this section before creating or filing tracker issues.

Tracker work has three levels, linked as GitHub sub-issues:

- **Epic:** high-level planning for non-technical stakeholders, written in
  plain language without implementation detail. Its children are tasks; a nested epic is allowed for a stakeholder
  sub-outcome, and
  [backlog selection](../../harness-skills/backlog-select/SKILL.md) follows it.
- **Task:** technical planning for one deliverable: approach, interfaces,
  acceptance criteria, and verification. Every new task is a sub-issue of an
  epic. A task normally lands as one pull request and is what a session or
  `pnpm worktree` starts from.
- **Subtask:** optional. A sub-issue of a task that carries implementation-level
  detail, or splits a task too large for one pull request. Each subtask is a
  deliverable of its own; once a task has subtasks, start sessions from them
  and close the task when they are done. A subtask has no children.

Tasks and subtasks are deliverable issues: `bug` or `enhancement`, and
`ready-for-agent` or `ready-for-human`. Only epics use `epic` and
`ready-for-planning`.

Sizing rule: before filing a task, find or create its epic. Link the task
under an existing open epic for the same outcome; otherwise file the epic
first, even for a one-task request. Add one task per pull request the request
needs, all linked before any implementation session starts. Issues filed
before this rule may stay standalone until they are next triaged. A
direction or design decision that gates the build is a task under the epic,
usually `ready-for-human`, not a standalone issue beside it.

Entry: an issue whose scope and acceptance criteria the user approved in chat may skip `needs-triage` and be filed ready, with its type
label, readiness label, and Gherkin criteria. File anything else, including
issues an agent proposes without that approval, as `needs-triage`. Session setup
and `pnpm worktree` reject an issue that fails these label rules.

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
