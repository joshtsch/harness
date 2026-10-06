# ADR-0014: Portable Remote Session State

**Status:** superseded by ADR-0015
**Date:** 2026-10-04
**Authors:** User and Codex
**Tags:** architecture, sessions, portability, storage

## Status

Superseded by ADR-0015

## Context

Session handoffs and installation-specific project metadata stored only in an
ignored directory cannot reliably move between machines or agent providers.
Concurrent sessions also need a shared claim and revision check. Session
artifacts may contain sensitive context, so remote storage must not receive
plaintext sensitive records. The harness must remain usable with more than one
agent provider and keep provider-specific views out of the state authority.

## Decision

Use a provider-neutral continuation contract backed by a dedicated Supabase
Postgres project. Postgres transactions own compare-and-swap revisions, session
state transitions, lease checks, and append-only artifact writes. A session has
one manifest and deterministic artifact keys for handoffs, decisions, outputs,
evaluations, and portable project metadata. Active, in-progress, and inactive
states determine which sessions can be claimed; resolved and superseded sessions
remain immutable history. A save during a live claim writes its artifacts and
releases the claim in the same transaction.

Sensitive artifact content is encrypted on the client with age before it enters
the remote store. Encryption identities and Supabase service credentials stay
in external custody. Deterministic keys use a keyed digest so session identities
do not appear in database keys. Temporary retry data must also be encrypted and
must not make a checkpoint resumable until the remote transaction succeeds.

Notion is a read-only, redacted view of continuation state; it is not a second
write authority. Granola remains a context source. The portable project
projection excludes credentials and machine-specific paths. Shared Supabase
and HCP Terraform infrastructure uses Terraform with remote state and locking.

## Consequences

### Positive

- **POS-001**: Codex, Gemini, and later providers can use the same stable record
  keys and state transitions.
- **POS-002**: A database transaction prevents concurrent saves from silently
  overwriting one another.
- **POS-003**: Sensitive artifacts remain encrypted before they leave the
  client, while Notion can offer a readable index without becoming authoritative.
- **POS-004**: Inactive history remains available without appearing in normal
  resume selection.

### Negative

- **NEG-001**: Resuming work requires access to the Supabase service and external
  encryption custody.
- **NEG-002**: The harness must maintain database migrations, RPC contracts,
  Terraform configuration, and provider adapters.
- **NEG-003**: Notion can lag behind the authoritative state and cannot safely
  accept edits that bypass transaction checks.
- **NEG-004**: Lost encryption identities can make sensitive artifacts
  permanently unreadable.

## Alternatives Considered

### Notion as the write authority

- **ALT-001**: Store canonical records directly in Notion pages.
- **ALT-002**: Rejected because the documented page update API does not provide
  compare-and-swap preconditions for the lease and revision rules.

### Local ignored files as the authority

- **ALT-003**: Keep handoffs and project metadata in ignored machine-local
  directories and copy them between machines as needed.
- **ALT-004**: Rejected because ignored state is not a dependable cross-machine
  or cross-provider continuation boundary.

### One provider-specific record format per agent

- **ALT-005**: Let Codex and Gemini store independent native handoffs.
- **ALT-006**: Rejected because sessions could not be resumed consistently
  across providers and concurrent claims would be uncoordinated.

## Implementation Notes

- **IMP-001**: Keep encryption, session key derivation, and provider storage
  behind tested interfaces; never accept a caller's privacy label as proof of
  encryption.
- **IMP-002**: Use SQL constraints and one transactional RPC for revision
  checks, leases, and artifact commits; restrict Data API grants to the
  dedicated service role.
- **IMP-003**: Provision the Supabase project through the Supabase Terraform
  provider and a locked remote HCP Terraform workspace.
- **IMP-004**: Treat Notion as a redacted, refreshable projection. Projection
  failure must not undo or reinterpret a committed checkpoint.
- **IMP-005**: Keep the migration additive until save/resume works remotely;
  remove ignored local handoff writes only after remote recovery is verified.
- **IMP-006**: Evaluate sessions near finalization and keep `save audit` review
  only. Ordinary `save` remains lightweight and never promotes policy.

## References

- **REF-001**: [Issue #141: Add portable remote session checkpoints and resume](https://github.com/joshtsch/harness-private-archive/issues/141)
- **REF-002**: [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- **REF-003**: [Supabase Terraform provider](https://supabase.com/docs/guides/deployment/terraform)
- **REF-004**: [Notion update page API](https://developers.notion.com/reference/patch-page)
- **REF-005**: [ADR-0013: Provider-neutral capabilities and skill governance](0013-provider-neutral-capabilities-and-skill-governance.md)
