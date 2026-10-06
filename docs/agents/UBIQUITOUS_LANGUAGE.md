# Ubiquitous Language

## Secure document domain

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Secure document** | Encrypted personal, medical, financial, account, or project-sensitive document kept outside tracked repository content. | Secret, private file |
| **Secure record** | Portable structured document containing facts and references for an authorized harness or project workflow. | Note, memory |
| **Record scope** | Set of actors eligible to request access to a secure record. | Permission |
| **Encryption identity** | Externally stored private key material required to decrypt secure records. | Access token, credential |
| **Primary encryption identity** | Encryption identity used for ordinary secure-record operations. | Main key, working password |
| **Recovery encryption identity** | Distinct encryption identity used when the primary identity is unavailable. | Backup password, spare key |
| **Key-custody provider** | External system that stores and returns encryption identities without becoming harness configuration. | Cloud directory, key file |
| **Recovery export** | Encrypted, separately stored copy of the recovery identity for provider or account loss. | Plaintext backup, key dump |
| **Key rotation** | Controlled replacement of encryption recipients while old ciphertext remains available until verification and cleanup. | Key replacement, rekey |
| **Decrypted workspace** | Temporary non-repository space used while an authorized workflow processes decrypted content. | Worktree |

## Record scopes

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Project scope** | Record scope limited to one configured project. | Child scope |
| **Business-line scope** | Record scope available to projects currently belonging to one business line. | Business scope, company scope |
| **Harness scope** | Record scope available to harness-level workflows, not projects by default. | Global scope |
| **Shared scope** | Record scope available to all projects and business lines, restricted to sanitized non-personal operational knowledge. | Harness scope |

## Relationships

- A **secure record** has one or more **record scopes**.
- A **project** may read project-scoped records associated with itself.
- A project may read business-line-scoped records for its current business-line memberships.
- A **harness** may read harness-scoped records; projects do not inherit that access.
- All projects and business lines may read shared-scoped records, subject to explicit user authorization.
- Every eligible read still requires explicit user authorization for the session.
- A **decrypted workspace** is temporary and never replaces the encrypted secure record.

## Example dialogue

The business-line identifier below is synthetic.

> **Agent:** "This record is associated with the `example_business` business line. May the current project read it?"
>
> **Harness:** "Only if the project currently belongs to `example_business` and the user authorizes access for this session."
>
> **Agent:** "What if the record is harness-scoped?"
>
> **Harness:** "A harness-level workflow may read it, but a project may not inherit that access."
>
> **Agent:** "What can use shared scope?"
>
> **Harness:** "Only sanitized operational knowledge with no personal, medical, financial, account-specific, or project-confidential data."

## Flagged ambiguities

- **Business** was replaced with **business line** as the canonical organizational term.
- **Harness scope** and **shared scope** are distinct: harness scope is for harness workflows; shared scope is available to all projects and business lines.
- **Eligibility** and **authorization** are distinct: scope determines who may request access, while the user must authorize each session read.
