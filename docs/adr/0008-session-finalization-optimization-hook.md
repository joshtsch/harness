# Harness-owned session-finalization optimization hook

**Status:** accepted

The harness will invoke self-optimization from a best-effort session-finalization hook after structured session state is complete, including failed sessions. The hook persists only redacted, session-scoped evidence and returns a review-only optimization handoff; it will not modify harness or project code, create automations, or promote candidates. Keeping the hook in the harness preserves one lifecycle boundary across independent projects while the manual handoff keeps promotion under review.

Hook errors are isolated from the primary session result and recorded as session diagnostics. Partial sessions submit only validated evidence; missing or failed safety, outcome, artifact, or observed-state gates produce no handoff. Evidence remains transient under `docs/.scratch/setup/<session-id>/observations.jsonl`, keyed by the session and trace provenance, and excludes raw transcripts, credentials, and PII. The handoff carries the candidate, supporting observations, provenance, validation guidance, expected risk, and rollback path to a local reviewer surface; that surface has no promotion or automation authority.
