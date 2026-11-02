# Backend contract

The trial defines behavior; the backend mapping defines execution. A mapping is
a documented procedure using existing tools, not a required plugin framework.
Keep expected answers and scoring outside the backend so replacing storage does
not change what counts as success.

## Behavioral case

Freeze a case with logical sources, facts, scope, actions, and a withheld rubric.
For example, ingest a source stating that Project Copper uses seven retry
attempts; then retrieve its retry setting and deny access from an unrelated
scope. The case must not require a Markdown page, row schema, vector index, or
particular retrieval technology. Those belong in the backend mapping.

Hash the frozen behavioral case bytes for version 2 `suiteDigest`. Hash each
representation and implementation separately for `backend.revision`. The mapping
must show how both representations preserve the same logical facts, versions,
scope, and distractors. A matching case hash alone does not prove equivalent
fixtures; review this mapping before comparing results.

## Required operation mapping

| Operation | Procedure must establish | Evidence |
| --- | --- | --- |
| Prepare | Isolated fixture/namespace, equivalent logical inputs, initial state, permitted operations | Fixture identity and baseline revision/digest |
| Ingest | Proposed or authorized change, effective scope, provenance, conflict/duplicate handling | Proposal or receipt and resulting revision |
| Retrieve | Real query through the selected interface, effective scope, fresh context where planned | Answer, source identifiers/versions, access outcome |
| Inspect | Changes to logical records, sources, scope, and unrelated state; eventual visibility when applicable | Before/after diff or queryable revision/receipt |
| Reset | Restore or dispose only the authorized isolated fixture | Reset result and restored baseline, if reset is used |

For each operation, identify the actual tool/command and classify it as
supported, unsupported, or blocked by missing setup/permission. Map a phase to
the operations it needs; missing mutation permission must not block a supported
read-only recall case. Use backend-native evidence: file hashes, record versions,
event offsets, or query receipts as appropriate. Preserve provenance semantics
without imposing one serialization format.

If a backend has eventual indexing, define a bounded visibility wait and record
ingestion completion separately from time until retrievable. Use an observed
timeout rather than an unbounded retry. If inspection cannot establish whether
ingestion duplicated facts, that criterion remains unsupported; do not infer
idempotency from a successful API response.

Apply authorization from the owning runtime before mutation. A namespace name,
fixture declaration, or this mapping cannot grant access. Do not change production
state or use a reset method against live data as part of an isolated trial.

## Existing implementations and capability gaps

For a repository vault, use [the existing procedure](backends/repository-vault.md).
For a record, graph, event, or vector system, inspect its existing interface and
write only the operation mapping needed for this trial. State implementation and
access gaps. Do not introduce a replacement database or silently fall back to a
vault to make a comparison pass.

The generic reporter supports any backend that can supply the observation
contract. It does not implement provider access, seeding, ingestion, inspection,
or reset. The behavioral evals use a repository fixture and structured JSON
records; these demonstrate procedure portability, not a live database adapter.
