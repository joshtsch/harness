---
name: memory-trials
description: "Reproduce and measure recall or ingestion failures with isolated trials, then compare a bounded improvement against the same cases."
---

# Memory trials

Turn a recall or ingestion complaint into repeatable evidence. Use the existing
memory evaluator for fixture preparation and preservation checks; use the trial
reporter for observed measurements. Neither helper runs agents or grades meaning.
Read [the protocol](references/protocol.md) for case and result formats.

## Bound the trial

Start with the user's failing example, or select a small representative subset
of the existing memory evaluation suite. Record the expected behavior, source
authority, access scope, and failure hypothesis before inspecting candidate
answers. Replace identifying details with synthetic facts. Keep actual Private
payloads in their authorized source; synthetic results do not prove live access.

Choose recall, ingestion, or ingest-then-recall. Add only the cases needed to
distinguish likely causes. Include a successful control and a denied or unknown
case. The [coverage guide](references/protocol.md#coverage) identifies ingestion
branches worth exercising. Finish this step with a frozen case set and a rubric
whose expected facts and sources are withheld from the tested agent.

## Prepare and execute

1. Prepare each variant and repetition separately with the existing evaluator.
   Record the suite digest, repository revision, skill snapshot, model/settings,
   tool configuration, context condition, planned phases, and attempt numbers.
   Keep cold/fresh and repeated-context runs in separate reports.
2. Run each generated prompt in a fresh independent agent context, using the
   same case order, settings, and tool grants for both variants. Do not give the
   tested agent the rubric, manifest, other responses, or the prior diagnosis.
   Use independent agents only when delegation is authorized and available.
   Otherwise use separate user-authorized sessions; unavailable execution stays
   blocked. Never substitute the main agent's imagined response for a trial.
3. Capture only observable timings and counts, with evidence references. Mark
   unavailable telemetry as null. Use wall-clock timestamps around actual agent
   execution; preparation/checking time is separate. Inspect permitted tool traces
   to count calls, source reads, and irrelevant reads. Use host token reports
   only when available; do not estimate tokens from characters.
4. Run the evaluator's fixture checks, then independently assess every rubric
   item against the response and actual artifacts. A mechanical pass is not a
   semantic pass. If the same agent authored the case and grades it, disclose
   that limitation. Record failures, unsupported behavior, blocked runs, and
   missing observations, not only successful answers.

Initial ingestion trials end at an unsaved proposal. For an application trial,
show the exact proposed fixture content/destinations, evidence, and validation
in the active review channel. Obtain separate post-preview approval before
applying it; follow the existing memory approval workflow. Do not fabricate
consent or reuse approval across changed variants. Without approval, report
application and dependent phases as blocked. Synthetic test transcripts are
permitted evaluation artifacts; they do not authorize saving live proposals.

After approved fixture application, validate citations, indexes, preserved sources,
and changed paths. Rerun identical ingestion and check for duplicate concepts,
index/log churn, or lost content. Then ask a fresh agent to retrieve the ingested
fact without providing the ingestion transcript or answer. Preserve the applied
fixture as the input snapshot for that recall phase. The initial evaluator's
read-only check still applies to its initial snapshot; do not treat intentional
approved changes as a passing initial trial.

## Compare and stop

Use `pnpm memory:trials report <run.json>` or
`pnpm memory:trials compare <baseline.json> <candidate.json>` from the harness root.
Report results by phase and case, including evidence, missing samples, and
available measurement counts. Interpret correctness and access failures before
speed; fewer tool calls alone do not prove improvement. Small-sample p95 values
are exploratory. Label fixture checks, agent behavior, and live-system evidence
separately.

Change at most one bounded factor for a comparison. Implementation fixes follow
their owning workflow; this skill does not alter policy, architecture, or live
memory. Stop when the reported failure is reproduced or explicitly unverified,
the planned trials are accounted for, and the smallest supported next step is
identified. Retain a sanitized regression case only through the normal reviewed
code/fixture workflow; this is not permission for durable memory capture.
