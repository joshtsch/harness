# User-scoped decision memory

**Status:** accepted
**Date:** 2026-09-27
**Authors:** User and Codex
**Tags:** memory, context, personalization, decisions

## Context

The harness contains guidance that is useful across sessions, but many choices
are user- or project-specific. A decision such as preferring HCP Terraform for
Terraform state should not become a universal harness policy, yet the harness
should not repeatedly ask the same user the same question. Infrastructure is
one example of a decision category; the same model should support calendars,
deployment, tooling, documentation, and future categories.

The harness already separates policy, workflow, skill, session, and memory
layers. Memory is allowed to suggest improvements but cannot override higher
layers or promote itself. The design needs to preserve that boundary while
detecting undocumented project deviations.

## Decision

Use a category-specific skill on top of a generic decision-memory contract. The
skill activates for explicit tools and semantic intent within its category,
then retrieves only relevant user-scoped memory and project configuration.

Store cross-project defaults as **decision preferences** in user-scoped memory.
Treat project-specific choices as **project overrides**. A project override
takes precedence over a decision preference, but should have a discoverable
**decision record** containing its category, scope, preferred pattern, actual
pattern, reason, date, and deciding authority.

When a project explicitly deviates from a decision preference but has no
recorded rationale, the category skill continues with the project configuration
and notifies the user about the missing rationale. It blocks only when the
actual configuration and intended choice are both ambiguous.

Memory retrieval is scoped by user, business line, project, and environment,
with narrower scopes taking precedence. Same-scope conflicts fail closed.
Stale memory is marked for reconfirmation rather than silently deleted.

Jev may classify decision-category intent, retrieve candidate memory, report
confidence and deviations, and propose a user-confirmed promotion. Jev may not
choose defaults, write authoritative decisions, or promote memory without
confirmation. The first implementation slice is the generic decision-memory
contract, one category skill, local user-scoped memory, and explicit
project-deviation detection; classifier integration and portable encrypted
synchronization are later slices.

## Consequences

### Positive

- User preferences reduce repeated category-specific questions without becoming
  universal policy.
- Project choices remain authoritative and can be explained when they differ
  from defaults.
- Memory remains reviewable, scoped, and subordinate to explicit configuration.
- Jev can improve routing and retrieval without receiving policy authority.

### Negative

- The harness must maintain category, scope, provenance, freshness, and conflict
  handling for decision memory.
- Users may see notifications when existing project configuration lacks a
  rationale.
- A provider-neutral memory interface is required if memory later becomes
  portable across machines.

## Alternatives considered

### Encode every decision in AGENTS.md

Rejected. `AGENTS.md` is repository policy and is too rigid for user-specific
preferences. It also makes local personalization look like a team-wide rule.

### Automatically promote repeated choices into harness policy

Rejected. Repeated behavior is evidence for a candidate improvement, not
authority to change policy or project configuration.

### Let Jev choose and write decisions

Rejected. Jev is a classifier and retrieval aid. Decision authority remains
with explicit project configuration and user confirmation.

## Implementation notes

- Define a provider-neutral decision-memory record and retrieval result.
- Keep local user memory outside tracked repository content; use encryption
  before adding portable synchronization.
- Include provenance, scope, confidence, freshness, and deviation status in
  retrieval results.
- Add review-only promotion from repeated observations to preferences or
  project documentation.
- Add tests for category and scope precedence, same-scope conflict failure,
  stale memory, undocumented deviations, and user-confirmed promotion.
