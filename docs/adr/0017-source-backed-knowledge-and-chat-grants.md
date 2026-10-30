# ADR-0017: Source-backed knowledge and chat source sets

**Status**: Accepted design; gateway implemented, live activation gated
**Date**: October 30, 2026
**Originating issue**: [#119](https://github.com/joshtsch/harness/issues/119)

Knowledge can be authoritative in a controlled provider without owning a Git
repository. Keep repository-wiki discovery intact and introduce a separate
source-backed gateway, initially for Notion. A chat may select multiple sources;
each retains its classification, subject, processor, purpose, expiry, and read
grants. Requested synthesis may combine sources and inherits the highest
classification. Saving and transfers require their own content/destination review.

The trusted host binds chat and processor identity before tool calls. The gateway
exposes discovery and reviewed reads, with no tool for granting access. Reviewed
page revisions and hashes prevent unreviewed source edits from reaching an agent.
This sacrifices immediate access to edited pages in exchange for classification
and provenance remaining tied to reviewed content. A dedicated source connection
and host isolation are prerequisites; prompt assertions and broad connector
search filters do not establish that boundary.

This extends [ADR-0016](0016-information-classification-and-private-retrieval.md)
with runtime grant checks. It does not activate a source, migrate content, or
provide native per-chat Codex host attestation. The operator integration and
verification requirements live in [knowledge providers](../agents/knowledge-providers.md).
Private content remains in its controlled source instead of being copied into
general Git memory. The existing preference backend and Restricted secure-record
workflow retain their authority.
