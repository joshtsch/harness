# Triage labels

Use canonical labels for issue type and workflow state. Every new issue enters
through `needs-triage`. Triage adds exactly one issue-type label (`bug` or
`enhancement`) and replaces `needs-triage` with exactly one readiness label when
scope and verification are complete. An epic uses `wayfinder:epic` and the
`ready-for-planning` state; deliverable issues use `ready-for-agent` or
`ready-for-human`. `pnpm check:triage` enforces label consistency and checks
that a planning-ready epic has a GitHub sub-issue.

| Label | Meaning | Use |
| --- | --- | --- |
| `bug` | Existing behavior fails or regresses. | Reproducible defect. |
| `enhancement` | New behavior or capability requested. | Feature or improvement. |
| `needs-triage` | Maintainer evaluation still required. | Unreviewed or ambiguous issue. |
| `ready-for-agent` | Fully specified for autonomous implementation. | Acceptance criteria, scope, and verification path are complete. |
| `ready-for-human` | Requires human implementation or decision. | Needs unavailable access, judgment, or coordination. |
| `ready-for-planning` | Epic is ready to plan and track. | The only readiness state for epics; requires `wayfinder:epic` and at least one child issue. |
| `wayfinder:epic` | Parent issue for a larger outcome. | Group related deliverable issues using GitHub sub-issues. |

Typical deliverable flow: new issue -> `needs-triage` -> `ready-for-agent` or
`ready-for-human`. Epic flow: new issue -> `needs-triage` -> `wayfinder:epic` ->
add at least one sub-issue -> `ready-for-planning`. An epic cannot be
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
targets. Use `wayfinder:theme:<name>` labels to group work by a recurring theme
across epics; themes do not replace parent/sub-issue relationships.
