# ADR-0015: Supabase-Only Portable Session State

**Status:** accepted
**Date:** 2026-10-04
**Authors:** User and Codex
**Tags:** architecture, sessions, portability, storage, privacy
**Supersedes:** [ADR-0014](0014-portable-remote-session-state.md)

## Status

Accepted

## Context

ADR-0014 selected Supabase as the transactional authority and Notion as a
redacted projection. The projection adds another user-specific store without
improving the claim, revision, or recovery contract. Portable project metadata
also has a different lifecycle from an individual session.

## Decision

Supabase is the only remote source of truth for portable session state and
user-level project metadata. Do not mirror continuation data into Notion.
Granola remains a context source, not a continuation store.

Store handoffs, decisions, outputs, and review-only evaluations as append-only
session artifacts with deterministic opaque keys. Keep portable private project
metadata in a separate user-level record with revision checks. Encrypt all
artifact and project-record content client-side with age to the existing
Bitwarden-held primary and recovery identities. Supabase may expose only opaque
keys, lifecycle state, revisions, and lease timing; the owner token itself is
never stored remotely.

Keep checkout paths, credentials, and machine-specific project settings local.
Treat `projects.local.yml` as a machine-local overlay/cache: sync portable fields
from the user-level record while preserving machine-specific local fields.

The `save` skill is provider-neutral and authored in `joshtsch/skills`. The
harness installs it project-locally and routes it for Codex and Gemini. A resume
creates a fresh one-hour claim. A protected local checkpoint carries its owner
token for explicit renew/save operations; normal command output never reveals
the token. If the checkpoint is lost, allow the lease to expire before takeover.

## Consequences

### Positive

- One remote authority handles portable continuation data and project metadata.
- Transactions protect lifecycle transitions, leases, and append-only revisions.
- Artifact content and portable project configuration are encrypted before
  leaving the machine.
- Project metadata can move between machines without sharing checkout paths or
  credentials.

### Negative

- Continuation requires Supabase and external encryption-key custody.
- Offline saves remain encrypted machine-local intents, with no automatic
  expiry, and cannot be resumed before successful remote commit.
- Each machine must hydrate its local project overlay after remote changes.

By default, flush rejects stale project-record revisions. With `--rebase`, it
merges the queued projection into the latest remote record. Remote values win
conflicts; fields found only in the queued projection stay.

## Alternatives Considered

### Notion projection

Rejected. A second remote copy adds synchronization and privacy surface without
being required by the continuation workflow.

### Local ignored files as the authority

Rejected. Ignored local state is not a dependable cross-machine or
cross-provider continuation boundary.

## Implementation Notes

- Use a locked HCP Terraform workspace for shared Supabase infrastructure.
- Existing artifact keys remain in the latest-revision index. Their revisions
  may increase, but never decrease; stored artifact revisions remain immutable.
- Store only a digest of the lease owner token in coordination metadata.
- Keep `save:audit` review-only; ordinary `save` does not run an audit or promote
  tentative decisions.
- Record explicit decisions with rationale and label unresolved questions as
  open.

## References

- [Issue #141: Add portable remote session checkpoints and resume](https://github.com/joshtsch/harness-private-archive/issues/141)
- [ADR-0014: Portable Remote Session State](0014-portable-remote-session-state.md)
- [ADR-0011: Bitwarden key custody and recovery](0011-bitwarden-key-custody-and-recovery.md)
- [ADR-0013: Provider-neutral capabilities and skill governance](0013-provider-neutral-capabilities-and-skill-governance.md)
