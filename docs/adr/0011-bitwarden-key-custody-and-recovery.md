# ADR-0011: Bitwarden key custody and recovery

**Status**: Accepted
**Date**: 2026-09-26
**Authors**: User and Codex
**Tags**: security, privacy, recovery, portability

***

## Context

The secure-record vault currently creates a local age identity file. Losing that
file makes every encrypted record unrecoverable. The harness needs automated
cross-device key custody without placing private identity material in Git,
issue trackers, logs, or persistent harness configuration.

The workflow must also support recovery after device loss. The primary and
recovery identities should be distinct, while remaining practical for a free
personal password-manager workflow.

## Decision

Use Bitwarden as the default key-custody provider for both identities:

- **Primary encryption identity**: the identity used for ordinary record access.
- **Recovery encryption identity**: a distinct identity stored in a separate
  Bitwarden secure note.

The harness must use an explicit Bitwarden CLI session for each operation and
must not persist a Bitwarden session token in the repository or harness secure
directory. Identity material is materialized only into a tightly permissioned
temporary file for the age operation, then removed automatically.

Maintain an encrypted offline export of the recovery identity as a separate
disaster-recovery path. The two identities may share one Bitwarden vault, but
the offline recovery export protects against Bitwarden account lockout or loss.

Encrypt every secure record to both recipients by default. Key rotation must
stage new ciphertext, verify decryption with the new identities, and preserve
the previous ciphertext until the user explicitly confirms cleanup.

## Consequences

### Positive

- **POS-001**: The primary workflow is portable across operating systems.
- **POS-002**: Key creation, retrieval, and recovery-record updates can be
  automated without clipboard transfer.
- **POS-003**: Device loss does not strand records when Bitwarden access and the
  offline recovery export are available.
- **POS-004**: Separate identities limit the impact of losing one key.

### Negative

- **NEG-001**: Both routine and recovery custody share Bitwarden as a provider;
  the offline export is required for provider-independent recovery.
- **NEG-002**: Secure operations require an explicit Bitwarden unlock/session.
- **NEG-003**: Bitwarden CLI installation, authentication, and device approval
  become prerequisites for automated key custody.
- **NEG-004**: Key rotation and offline-export handling add operational steps.

## Alternatives Considered

### Apple Keychain as primary custody

- **ALT-001**: Use macOS Keychain/iCloud Keychain for the primary identity and
  Bitwarden for recovery.
- **ALT-002**: Rejected as the default because it makes the core workflow
  macOS-specific and less portable when the harness moves systems.

### Google Password Manager recovery

- **ALT-003**: Import the recovery identity through Google Password Manager's
  CSV workflow.
- **ALT-004**: Rejected because the supported desktop path requires a manual
  import and does not provide the desired direct CLI write interface.

### Keeper recovery

- **ALT-005**: Use Keeper Commander to create and retrieve a recovery record.
- **ALT-006**: Rejected as the first provider because the free-tier fit is less
  clear than Bitwarden's free personal plan.

## Implementation Notes

- **IMP-001**: Add a provider-neutral key-custody interface.
- **IMP-002**: Implement a Bitwarden adapter using the official CLI, with secret
  values passed through protected temporary input rather than process arguments.
- **IMP-003**: Add primary and recovery identity setup, exact record naming, and
  no-persistent-session behavior.
- **IMP-004**: Add a disposable-record recovery drill before accepting real
  records.
- **IMP-005**: Add dual-recipient encryption and staged key rotation.
- **IMP-006**: Add encrypted recovery export/import with explicit confirmation.
- **IMP-007**: Migrate the existing secure record only after the setup and
  recovery drill pass; verify it before deleting its plaintext source.

## Clarified Contracts

- **CON-001**: Provider adapters expose identity lifecycle operations, not provider-specific session management. A Bitwarden session may be used only within one command invocation and is never persisted.
- **CON-002**: Primary and recovery identities use exact canonical custody-note names and strict machine-readable envelopes. Partial custody state, duplicate notes, malformed notes, and mismatched recipients fail closed.
- **CON-003**: New secure-record writes use dual-recipient encryption by default. Existing single-recipient ciphertext remains readable and is upgraded only through explicit rotation or migration.
- **CON-004**: Recovery export uses an age-encrypted, self-describing envelope and requires explicit confirmation before import can create or replace the recovery custody note.
- **CON-005**: Rotation verifies decryption with both new identities and preserves old ciphertext until a separate explicit cleanup operation.
- **CON-006**: Real-record migration is separate from the disposable recovery drill. Failed verification or missing cleanup confirmation leaves the plaintext source and prior encrypted state untouched.
- **CON-007**: The first implementation delivers the provider adapter, recovery drill, dual-recipient record support, guarded migration, and verification. It does not operate on the real secure record automatically.

## References

- [Bitwarden free plan](https://bitwarden.com/pricing/)
- [Bitwarden CLI](https://bitwarden.com/help/cli/)
- `docs/adr/0010-encrypted-secure-record-vault.md`
