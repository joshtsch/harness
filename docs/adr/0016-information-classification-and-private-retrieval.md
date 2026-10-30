# ADR-0016: Information classification and source-backed Private retrieval

**Status**: Accepted design; Private retrieval is not activated
**Date**: October 30, 2026
**Originating issue**: [#113](https://github.com/joshtsch/harness/issues/113)

## Decision and rationale

The previous handling rules grouped ordinary contact PII with highly sensitive
records. Adopt Public, Private, and Restricted information classifications,
independent of access scope and PII. This permits controlled use of ordinary
contact facts while preserving encrypted handling for Restricted information.
The authoritative rules live in [data safety](../agents/data-safety.md).

Keep Private facts in their existing authoritative sources and retrieve them
within approved scopes. Use a dedicated Notion area for the first new personal
contact pilot; preserve existing CRM ownership. The pilot design initially permits
Codex using OpenAI models to process relevant fields for requested tasks.
These choices do not configure or activate any source or processing grant.

Memory provides [source-backed retrieval and reviewed source updates](../agents/harness-memory.md#private-source-routing),
rather than keeping another contact database in general vaults. Personal scope
requires explicit cross-scope grants. Enforce source and scope boundaries before
content reaches an agent; filtered views and selective queries alone do not
establish isolation.

## Trade-offs

Encrypting every contact fact through the secure-record workflow would preserve
one storage path but retain unnecessary unlock friction for ordinary contacts.
Copying Private facts into Git-backed memory would simplify local retrieval but
spread PII across histories, indexes, and generated outputs. Source-backed
retrieval avoids those copies at the cost of source availability and a new
authorization boundary. It also requires separate processor approval because
approved storage does not imply approved model disclosure.

Necessary Private details may appear in direct answers. Conversation and tool
retention remain governed by the approved service's settings; this design does
not promise deletion from service history.

## Implementation boundary

This contribution changes documentation only. Personal scope, service allowlists,
and Private-source memory retrieval have no runtime implementation. Preserve the
existing encrypted-record workflow and keep live pilot retrieval disabled until
configured grants and enforcement are verified. Resolve revocation, stale sources,
and connector behavior in the implementation design before activation. Provisioning,
migration, background processing, and unapproved exports need separate authority.

This decision refines the personal-information handling described in
[ADR-0010](0010-encrypted-secure-record-vault.md); it does not replace that ADR's
Restricted record encryption or session-authorization requirements.

## Provider evidence

- [Notion security](https://www.notion.com/en-US/security): provider-managed
  encryption at rest and in transit differs from harness encryption before storage.
- [Notion MCP security](https://developers.notion.com/guides/mcp/mcp-security-best-practices):
  a connected client can access content available to its connected user.
- [Notion authorization](https://developers.notion.com/guides/get-started/authorization):
  internal connections require explicitly shared pages. A narrowly granted
  connection is a candidate boundary, pending verification of the actual adapter.
