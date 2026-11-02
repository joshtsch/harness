---
name: memory-trials
description: "Reproduce and measure recall or ingestion failures with isolated trials, then compare a bounded improvement against the same cases."
---

# Memory trials

Turn a recall or ingestion complaint into repeatable evidence across memory
architectures. Define the behavioral case independently of storage, then map
the selected backend's operations through [the backend contract](references/backend-contract.md).
Read [the protocol](references/protocol.md) for scoring and result formats.
The reporter summarizes observations; it does not run agents or grade meaning.

## Bound the trial

Start with the user's failing example or an existing behavioral case. Record
the expected behavior, source
authority, access scope, and failure hypothesis before inspecting candidate
answers. Replace identifying details with synthetic facts. Keep actual Private
payloads in their authorized source; synthetic results do not prove live access.

Choose recall, ingestion, or ingest-then-recall. Add only the cases needed to
distinguish likely causes. Include a successful control and a denied or unknown
case. The [coverage guide](references/protocol.md#coverage) identifies ingestion
branches worth exercising. Finish this step with a frozen case set and a rubric
whose expected facts and sources are withheld from the tested agent. The case
contains logical facts, scope, and expected outcomes; backend paths, tables,
namespaces, and preparation commands belong in a separate backend mapping.

## Prepare and execute

1. Inspect the selected backend and its applicable policy. Map prepare, ingest,
   retrieve, inspect, and reset to available tools/procedures, with capability
   gaps explicit. Follow permitted entry points to the minimum native data needed
   to verify the actual targets. Permission to inspect a fixture is distinct from
   permission to mutate it; report an access blocker only when one exists.
   Use [the repository-vault procedure](references/backends/repository-vault.md)
   only for that backend. Other backends need no vault, wiki, or harness-memory
   dependency. Creating a mapping does not implement missing backend operations.
2. Prepare each variant and repetition in an isolated fixture or namespace.
   Record the behavioral suite digest, backend architecture/adapter/revision,
   source snapshot, model/settings, tool grants, context condition, planned phases,
   and attempt numbers. Put representation-specific details in backend identity.
   Keep cold/fresh and repeated-context runs in separate reports.
3. Run each task in a fresh independent agent context, using the
   same case order, settings, and tool grants for both variants. Do not give the
   tested agent the rubric, manifest, other responses, or the prior diagnosis.
   Use independent agents only when delegation is authorized and available.
   Otherwise use separate user-authorized sessions; unavailable execution stays
   blocked. Never substitute the main agent's imagined response for a trial.
4. Capture only observable timings and counts, with evidence references. Mark
   unavailable telemetry as null. Use wall-clock timestamps around actual agent
   execution; preparation/checking time is separate. Inspect permitted tool traces
   to count calls, source reads, and irrelevant reads. Use host token reports
   only when available; do not estimate tokens from characters.
5. Run the backend's preservation and scope checks, then independently assess every rubric
   item against the response and actual artifacts. A mechanical pass is not a
   semantic pass. If the same agent authored the case and grades it, disclose
   that limitation. Record failures, unsupported behavior, blocked runs, and
   missing observations, not only successful answers.

Apply the selected runtime's authorization and privacy rules before ingestion.
In this harness, the [memory approval policy](../../docs/agents/harness-memory.md#dry-run-first-memory-changes)
requires an unsaved proposal and separate approval of exact content/destinations
before application, regardless of backend. A mapping cannot grant or simulate
approval. An unavailable operation is unsupported; missing permission or setup
is blocked. Account for dependent phases without claiming they ran. Synthetic
test transcripts are evaluation artifacts, not permission to save live proposals.
Record established blocked/unsupported outcomes in the corresponding planned
slot, with capability/permission evidence and unavailable execution measurements.
Such an observation describes a determination, not a completed trial. Leave a
slot missing only when its outcome has not been assessed.

After authorized application, inspect the actual change receipt, provenance,
source preservation, and discoverability. Rerun identical ingestion and check
for duplicate facts, unnecessary changes, or lost content. Then ask a fresh agent
to retrieve the ingested
fact without providing the ingestion transcript or answer. Preserve the applied
state as the input snapshot for that recall phase. Preserve separate before/after
evidence; approved changes cannot make an initially unauthorized write pass.

## Compare and stop

Use `pnpm memory:trials report <run.json>` or
`pnpm memory:trials compare <baseline.json> <candidate.json>` from the harness root.
Report results by phase and case, including evidence, missing samples, and
available measurement counts and both backend identities. Interpret correctness and access failures before
speed; fewer tool calls alone do not prove improvement. Small-sample p95 values
are exploratory. Label fixture checks, agent behavior, and live-system evidence
separately.

Change at most one bounded factor for a comparison. Implementation fixes follow
their owning workflow; this skill does not alter policy, architecture, or live
memory. Stop when the reported failure is reproduced or explicitly unverified,
the planned trials are accounted for, and the smallest supported next step is
identified. Retain a sanitized regression case only through the normal reviewed
code/fixture workflow; this is not permission for durable memory capture.
