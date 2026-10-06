# Layered self-optimizing context

**Status:** accepted

The harness uses seven ordered context layers: policy, domain, workflow, mode, skill, session, and memory. Higher layers constrain lower layers; conflicts fail closed, and memory may propose improvements but cannot override policy or promote itself. Modes provide session-wide operating posture, while self-optimization follows a trace, feedback, eval, gate, and handoff loop: it records evidence after work, turns durable feedback themes into regression evals, evaluates them at session boundaries, and promotes durable changes only through the appropriate project or harness review. This keeps the initial context thin while allowing measured, scoped improvement over time.

Each layer has a narrow contract. Policy owns non-negotiable safety and authority limits; domain owns vocabulary; workflow owns lifecycle and evidence; mode owns session posture; skill owns one bounded procedure; session owns current work state; memory owns evidence-backed observations and candidate improvements. A resolver records excluded lower-precedence entries and rejects duplicate identities or conflicts within one layer, so unresolved input cannot silently enter agent context.

The resolved context manifest is metadata, not a prompt. It records the active mode, source and provenance for included and excluded entries, precedence decisions, conflicts, an estimated context cost, and the harness contract for instructions, tools, routing, output requirements, and validation checks. Contract items are short summaries; secrets, personal data, transcripts, and provider payloads are not manifest inputs. Host-specific prompt construction remains a separate concern.

## Consequences

- Initial modes are research, implementation, review, and triage.
- Manual mode selection is authoritative; automatic recommendations require confirmation.
- Session-local adaptation may be automatic; project-local and shared changes require review.
- Human feedback and artifact-level validation outrank unverified model claims; generated evals require review before entering durable regression coverage.
- Subagents remain a later execution-focused backlog item, not a context layer or initial implementation dependency.
