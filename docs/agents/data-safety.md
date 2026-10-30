# Secrets and PII Safety

Keep secrets and personally identifiable information (PII) out of harness and
child-project repositories, issue comments, agent briefs, harness logs, scratch
metadata, MCP configuration, and general generated artifacts. Private-source
retrieval and approved exports follow the boundaries below; neither permits
copying PII into those surfaces.

## Information classification

Classify information separately from who may access it. PII is a data attribute,
not a security level. Non-personal business information may also need protection.

| Tier | Meaning | Storage |
| --- | --- | --- |
| Public | Reviewed as suitable for publication; publication still needs authorization. | Public documentation and repositories. |
| Private | Ordinary personal or business information requiring controlled access. | An approved source with provider-managed encryption and access controls. |
| Restricted | Secrets or information whose exposure could cause substantial harm. | The existing encrypted secure-record workflow or external secret custody. |

Ordinary names, email addresses, phone numbers, company/role, and neutral
relationship facts default to Private. Credentials, medical details, confidential
affiliations, and sensitive relationship notes default to Restricted. Context and
combinations can raise classification. A mixed record takes its highest tier
unless its fields are independently separated and retrieved. Review unclear cases
before disclosure; a summary does not automatically lower classification.

## Access and processing boundaries

Access scope is independent of classification: personal, project, business line,
harness, or shared. Personal records need explicit grants for cross-scope use;
harness access does not make them available to projects. Shared scope remains
limited to sanitized non-personal operational knowledge.

Before enabling Private retrieval, approve the authoritative source, eligible
scope, and processing services, then verify a retrieval path that enforces those
boundaries before content reaches the agent. With those prerequisites met, an
agent may retrieve the minimum relevant fields automatically for a user-requested
task within scope. Storage approval alone does not approve disclosure to a model
or tool. Other processors, onward tool disclosures, scheduled tasks, and background
access require separate approval. Messaging and source writes retain their own
authorization requirements. Restricted access retains explicit session authorization.

Necessary Private details may appear in direct answers for the requested task.
Exports need an approved destination and scope. Conversation and tool exchanges
may be retained by the approved agent service under its settings; this policy does
not promise ephemeral processing or deletion from service history. Keep Private
payloads out of harness logs, scratch files, general vaults, and unapproved exports.

## Approved design and activation status

The accepted pilot design uses a dedicated Private contact area in Notion for new
personal contact facts. Existing CRM and other authoritative sources stay in
place. Its initial processing allowlist is Codex using OpenAI models, for
user-requested tasks only. These are design approvals, not active source grants
or a configured service allowlist; private identifiers belong outside public policy.

The [knowledge gateway](knowledge-providers.md) validates personal scope,
processor restrictions, source sets, expiry, and reviewed Notion content.
Trusted native host binding and live source/connection grants remain unconfigured.
Keep the pilot disabled until those grants and the host boundary are verified. A filtered view,
selected output fields, or an agent instruction is not access isolation. Use a
suitably scoped connection or trusted retrieval gateway and keep Restricted notes
outside the pilot. Implementation must resolve revocation, stale sources, and
connector verification before activation. Existing secure-record scopes are
application checks after decryption, not separate cryptographic compartments.

The [architectural decision](../adr/0016-information-classification-and-private-retrieval.md)
records the trade-off; [memory integration](harness-memory.md#private-source-routing)
defines the routing boundary. Live source activation and content migration
retain their separate setup and review gates; implementing the gateway does not
authorize either operation.

## Rules

- Keep API keys, OAuth tokens, passwords, private keys, and connection strings in an external secret store or environment variables.
- Keep `.env` files and local credential material untracked; commit only safe templates such as `.env.example`.
- Treat CRM records, meeting notes, transcripts, attendee details, email addresses, phone numbers, and customer-specific context as PII or sensitive business data unless explicitly confirmed otherwise.
- Do not copy MCP results from Attio or Granola into tracked files. Record only stable identifiers or redacted summaries when durable context is genuinely required.
- Redact secrets and PII from GitHub issues, PRs, comments, test fixtures, command output, and `docs/.scratch/` state.
- Run `pnpm check:sensitive` against staged changes before committing. Treat findings as a blocking signal and review the complete diff manually; the scanner cannot prove that content is safe.

Use environment-variable references for external identifiers that could reveal personal or sensitive account context. Keep the resolved values in local environment configuration or an external secret store, never in tracked YAML, MCP configuration, logs, or issue content.

## Tool intake implication

When adding a tool, determine whether its data is harness/org-level, project-level, or session-level and whether that scope could expose another project's or person's data. Prefer the narrowest scope that supports the workflow, and never encode credentials or raw records in repository configuration.
