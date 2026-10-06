# Triage labels

Use canonical labels for issue type and workflow state. Every new issue enters
through `needs-triage`. Triage adds exactly one issue-type label (`bug` or
`enhancement`) and replaces `needs-triage` with exactly one readiness label when
scope and verification are complete. Do not treat an issue as ready until both
labels exist. `pnpm check:triage` enforces these rules across open issues.

| Label | Meaning | Use |
| --- | --- | --- |
| `bug` | Existing behavior fails or regresses. | Reproducible defect. |
| `enhancement` | New behavior or capability requested. | Feature or improvement. |
| `needs-triage` | Maintainer evaluation still required. | Unreviewed or ambiguous issue. |
| `ready-for-agent` | Fully specified for autonomous implementation. | Acceptance criteria, scope, and verification path are complete. |
| `ready-for-human` | Requires human implementation or decision. | Needs unavailable access, judgment, or coordination. |

Typical flow: new issue -> `needs-triage` -> `ready-for-agent` or
`ready-for-human`. Keep `needs-triage` for unreviewed or ambiguous issues; it
cannot coexist with a readiness label. `wayfinder:*` labels describe planning
tickets and are separate from this issue-triage workflow.
