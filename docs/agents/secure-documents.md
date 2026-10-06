# Secure Document Storage

Secure documents contain personal, medical, financial, account, or plan-specific information that must not enter Git history, issue trackers, logs, or generated artifacts.

## Current default

Use the harness-local directory:

```text
<harness-root>/.secure-documents/
```

This directory is ignored by Git. It is local-only storage, not a backup or a substitute for encryption. Keep sensitive files encrypted at rest and do not place credentials in plaintext there.

The harness-level location is the default because it is available to every configured project without copying personal data into a child repository. Store project-specific references as sanitized pointers, not as the secure documents themselves.

## Future project-level cloud storage

The storage model should support an optional project-level cloud directory later. That integration must be explicit and scoped to one project, with credentials supplied by an external secret store or environment configuration. It must never place provider tokens, account identifiers, or downloaded personal records in `projects.yml`, `projects.local.yml`, or other tracked files.

Until that capability exists, agents must use `.secure-documents/` as the default and must not invent cloud paths or upload personal documents.

## Harness commands

The harness exposes explicit `secure:init`, `secure:login`, `secure:custody`, `secure:migrate`, `secure:rotate`, `secure:list`, `secure:read`, and `secure:write` commands; the README contains the invocation examples. Custody, migration, and rotation accept an explicit Bitwarden session or interactive unlock. `secure:login` stores only the short-lived session token in a user-scoped, `0600` temporary file outside the repository so separate harness processes can reuse it; it never writes the session to tracked or scratch state. `secure:custody export`, `secure:custody import`, and `secure:rotate` require explicit confirmation flags. `age` is a harness prerequisite and is checked by `pnpm check:prereqs` and `pnpm init:harness`.

Set `HARNESS_SECURE_AGE_IDENTITY` for reads and `HARNESS_SECURE_AGE_RECIPIENTS` for writes. The value must be a comma-separated list containing both the primary and recovery recipients. Set `HARNESS_SECURE_DOCUMENTS_DIR` only when explicitly using another encrypted directory. The commands require the external `age` executable and fail closed when it is unavailable.

Run `pnpm secure:custody -- setup` before the first new write. It creates or
validates both identities in Bitwarden and verifies both custody notes. Run
`pnpm secure:init` only when an external age identity must be initialized; it
restricts the identity file to owner read/write permissions and prints only the
public recipient plus session-local environment exports. Keep the identity in
an external secret store or another user-protected location; never copy it into
the repository, issue tracker, or wiki.

Secure-record writes encrypt the note with age and store the ciphertext in a
Bitwarden Secure Note named `Harness Secure Record: <record-id>`. The local
`.md.age` file remains as a compatibility mirror during migration; reads and
lists prefer Bitwarden and can still read local-only records.

For a plaintext source, write the encrypted record, read it back successfully,
and only then remove the plaintext source with explicit user confirmation:

```text
pnpm secure:init
pnpm secure:write -- <record-id> --input <plaintext-markdown-file>
pnpm secure:read -- <record-id> --authorize --actor harness
```

Project actors use `--actor project:<project-name>`. The harness resolves current business-line membership from `projects.yml`; a project cannot list or read another project's records.

## Portable record format

Use Markdown or YAML with stable field names so a record can move between systems. Keep the secure record separate from the wiki; the wiki may contain a redacted template, source-backed conclusions, and a pointer to the local record.

Recommended fields:

```yaml
provider:
plan_year:
plan_name:
coverage_region:
covered_relationships:
questions:
verification:
last_verified:
source_documents:
```

Never store member IDs, claim numbers, credentials, medical results, or screenshots in tracked repositories.
