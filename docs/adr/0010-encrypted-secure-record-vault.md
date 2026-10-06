# ADR-0010: Encrypted secure-record vault

**Status**: Accepted
**Date**: 2026-09-26
**Authors**: User and Codex
**Tags**: architecture, security, privacy, storage

***

## Status

Accepted

## Context

The harness needs to work with personal, medical, financial, account-specific, and project-sensitive records without placing plaintext data in Git, wiki pages, logs, worktrees, or generated artifacts. Records should remain portable across systems, support encrypted sync, and be available to authorized workflows without weakening project isolation.

The current default is a harness-local ignored directory. Future deployments may use project-level cloud directories, but cloud paths and credentials must not become implicit or tracked configuration.

## Decision

Use individually encrypted Markdown/YAML records, with separately encrypted attachments when needed. Use `age` keypair encryption. Keep the private encryption identity in an external secret store such as Apple Passwords/iCloud Keychain; never store it in the harness.

The default local storage location is the harness-level `.secure-documents/` directory. An explicit environment/configuration override may later point to a project-level cloud directory containing encrypted files.

Agents access records only after explicit user authorization for the current session. Decryption occurs into a temporary workspace outside repositories and worktrees. Missing keys, records, or sync locations fail closed; no plaintext or alternate cloud fallback is permitted.

Secure records use four scopes:

- **Project**: one project only.
- **Business line**: projects with current membership in the business line.
- **Harness**: harness-level workflows only; projects do not inherit access.
- **Shared**: all projects and business lines, but only sanitized non-personal operational knowledge.

Scope determines eligibility; every read still requires explicit user authorization. Current `projects.yml` business-line membership determines access, so leaving a business line removes inherited access.

## Consequences

### Positive

- **POS-001**: Personal records remain outside Git history and child repositories.
- **POS-002**: Encrypted Markdown/YAML is human-readable after authorization and portable across systems.
- **POS-003**: Project isolation remains the default while business-line and shared knowledge have explicit, bounded scopes.
- **POS-004**: Encrypted ciphertext can sync through a user-selected cloud directory without exposing plaintext to the sync provider.

### Negative

- **NEG-001**: Users must protect and back up the external encryption identity; the harness cannot recover lost keys.
- **NEG-002**: Explicit unlock adds friction and prevents fully unattended secure-record workflows.
- **NEG-003**: Concurrent edits require conflict copies and manual reconciliation.
- **NEG-004**: Secure-record access cannot be debugged from plaintext logs; operational logs must omit record contents and identifiers.

## Alternatives Considered

### Locked Apple Notes as the system of record

- **ALT-001**: **Description**: Store the record in a locked iCloud Notes note and access it manually across Apple devices.
- **ALT-002**: **Rejection Reason**: Convenient sync, but not a stable filesystem interface for harness workflows or cross-platform migration.

### Plaintext Markdown in the ignored directory

- **ALT-003**: **Description**: Store readable Markdown directly under `.secure-documents/`.
- **ALT-004**: **Rejection Reason**: Git ignores the path but does not protect local plaintext from device compromise, backup exposure, or accidental copying.

### One monolithic encrypted vault

- **ALT-005**: **Description**: Encrypt all records and attachments in one vault file.
- **ALT-006**: **Rejection Reason**: Makes selective migration, conflict handling, and scope enforcement harder than per-record encryption.

## Implementation Notes

- **IMP-001**: Define stable Markdown/YAML fields for provider, plan year, scope, questions, verification, and source documents.
- **IMP-002**: Support `list`, `read/decrypt`, `write/encrypt`, and explicit encrypted export/import operations.
- **IMP-003**: Keep decrypted files outside repositories and remove them automatically after processing.
- **IMP-004**: Store attachments as separately encrypted files referenced by the secure record.
- **IMP-005**: Detect concurrent edits and create conflict copies rather than silently overwriting records.
- **IMP-006**: Require explicit confirmation before deleting encrypted records or attachments; automatically remove decrypted temporary files.

## References

- **REF-001**: `docs/agents/data-safety.md`
- **REF-002**: `docs/agents/secure-documents.md`
- **REF-003**: `docs/adr/0005-business-line-tool-metadata.md`
