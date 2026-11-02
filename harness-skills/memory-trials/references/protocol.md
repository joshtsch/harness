# Trial protocol

## Coverage

Use the branches relevant to the complaint, rather than running every case:

| Phase | Observable checks |
| --- | --- |
| Recall | Correct authoritative source; supported answer; citations; freshness; conflicts; appropriate unknown/access denial; no persistent writes |
| Ingestion proposal | Correct owner and destination; exact proposed content; provenance; uncertainty; existing-content reconciliation; no premature persistence |
| Approved application | Only authorized changes applied; sources and unrelated state preserved; valid scope, provenance, and discoverability |
| Identical ingestion rerun | No duplicate logical facts, lost content, or unnecessary changes when evidence is unchanged |
| Fresh recall after ingestion | Newly ingested information discoverable through the selected retrieval interface without the previous conversation |

For ingestion, include duplicate evidence, conflicting updates, source instructions
that must remain data, and sensitive input that cannot enter a general vault.
Simulate deletion/supersession only if relevant; preserve rollback evidence.
Use executable approval regression tests for stale fingerprints and destination
changes. Those tests establish API behavior, not that a human gave live approval.

## Backend preparation

Use [the backend contract](backend-contract.md) to map the same behavioral cases
onto the selected storage interface. The repository-vault evaluator is one
implementation; its file layout is not the generic case format. Keep withheld
rubrics outside the tested agent's prompt and source data. Record before/after
evidence and use the actual ingested result for subsequent recall.

## Measurements

The reporter reads this JSON shape. List every planned case/phase/attempt in
`expected` before execution. Unobserved slots remain missing; they cannot improve
the pass rate. Evidence entries are sanitized local references, not payloads.

```json
{
  "version": 2,
  "suiteDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "variant": "baseline",
  "revision": "repository-and-skill-snapshot-reference",
  "backend": {
    "architecture": "record-store",
    "adapter": "selected-backend-procedure",
    "revision": "implementation-and-source-representation-snapshot"
  },
  "environment": {
    "model": "actual-model-id",
    "settings": "recorded-reasoning-and-generation-settings",
    "tools": "common-agent-tool-grants",
    "context": "fresh"
  },
  "expected": [
    { "case": "ingest-retry-policy", "phase": "ingest-proposal", "attempt": 1 }
  ],
  "observations": [
    {
      "case": "ingest-retry-policy",
      "phase": "ingest-proposal",
      "attempt": 1,
      "outcome": "pass",
      "semanticReviewed": true,
      "evidence": ["runs/ingest-retry-policy/response.md", "review/rubric.md"],
      "measurements": {
        "elapsedMs": null,
        "firstEvidenceMs": null,
        "toolCalls": null,
        "sourceReads": null,
        "irrelevantReads": null,
        "inputTokens": null,
        "outputTokens": null
      }
    }
  ]
}
```

This example shows the format, not an observed result. Phases are `recall`,
`ingest-proposal`, `ingest-apply`, `ingest-rerun`, and `roundtrip-recall`.
Outcomes are `pass`, `fail`, `blocked`, and `unsupported`. A pass requires
semantic review; the boolean records the reviewer claim, not proof of review.
Record an established capability or permission gap as an `unsupported` or
`blocked` observation with its inspected evidence, `semanticReviewed: false`,
and empty or null measurements. This does not claim that the phase executed.
Use missing slots for unassessed outcomes. `environment.context` records the
planned condition and must be `fresh` or `repeated`, even before execution;
unknown actual model/settings/tools can use explicit unavailable labels.
Evidence and measurements must come from actual trials. Count a tool call as
one invoked tool operation, a source read as one source-content fetch, and an
irrelevant read as a fetched source contributing no relevant evidence under
the frozen rubric. A batched call can contain multiple reads. Apply the same
definitions to both variants. Record unknown or hidden activity as unavailable.

The report includes median and nearest-rank p95 for every observed measurement,
including failed attempts; unavailable counts include unobserved slots. It does
not calculate token prices or infer causal performance gains. Paired deltas are
candidate minus baseline and remain null if either measurement is unavailable.
Compare only matching format versions, behavioral suite digests, environments,
and planned slots in the same order. Backend architecture, adapter, and revision
may differ: these identify the implementation under evaluation. Hold logical
source inputs, model/settings, agent tool grants, order, and context conditions
fixed. Backend-native operations may differ under those grants; record their
mapping and count them consistently. Compare fresh and repeated-context trials
separately. Both backend identities appear in the report.

Version 1 reports remain readable with their existing fixture-file digest and no
backend identity. The reporter refuses mixed version comparisons; prepare new
version 2 trials with the reviewed behavioral case rather than relabeling old
measurements. No automatic data migration or authority change occurs.

Use one attempt for diagnosis, then repeat enough cases to check a proposed
improvement. Keep repetitions explicit and account for timeouts as failed or
blocked observations with measured elapsed time. Choose a time/cost budget
before starting; do not silently launch an unbounded trial campaign.
