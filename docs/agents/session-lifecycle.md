# Session and Worktree Lifecycle

0. Run the repository-scope gate: inventory every repository the session may modify, classify each boundary, and register every durable project before opening issues or creating branches/worktrees.
1. Validate `projects.yml` and its permitted local overlay, then resolve the selected projects.
2. Require an explicit `--goal` and resolve the coordinating issue and purpose. Every implementation session must resolve an existing issue through the configured tracker; tracker access failures fail closed. Store the goal in the session manifest and adjacent generated `AGENTS.md`.
3. Clone missing projects. At session start, inspect each participating default clone, fetch clean default checkouts with pruning, and fast-forward only when the local branch is an ancestor of its fetched origin branch. Preserve dirty, ahead, divergent, detached, and nondefault checkouts.
4. Report every prepared clone as `updated`, `current`, or `skipped` with a reason; record those outcomes in the manifest and events. If any clone is skipped, stop before bootstrap or worktree creation. Otherwise run project bootstrap setup when needed and verify the default branch is clean and exactly matches its remote-tracking branch.
5. Create one deterministic branch and worktree per `{project, issue, branch}` tuple under `.worktrees/`. Include the issue key and normalized ticket title in bounded, filesystem-safe names. Use an explicit attempt suffix for parallel retries.
6. Run worktree setup and harness-owned verification. Required multi-project sessions fail closed if a selected project cannot be prepared; partial operation requires an explicit opt-in.
7. Work across the participating worktrees. Record transient session, project, issue, worktree, handoff, and recovery state in ignored `docs/.scratch/`.

At finalization, the harness emits one `SessionFinalization` value after worktrees,
artifacts, and observed state are complete. It contains only traceable references,
structured events, feedback, and validation results; it never contains raw prompts,
transcripts, credentials, or project implementation details. Successful sessions can
produce a review-only handoff, while failed, cancelled, and interrupted sessions can
still provide evidence without producing side effects. Hook failures are diagnostics,
not session failures.

The setup lifecycle enables the hook by default. Set `HARNESS_OPTIMIZATION_ENABLED=0`
to disable collection and persistence for a session; setup completion is unaffected.

## Session goal and agent context

Run `pnpm setup:session --goal "Expected outcome" <projects> <issue-number>`.
The goal must be a non-empty single line of at most 1000 characters. The existing
sensitive-content scanner rejects likely secrets or PII; callers must still
review goal text because pattern checks cannot prove it safe.
The purpose comes from the resolved issue title; a goal is supplied separately.

The manifest and generated session instructions live under
`docs/.scratch/setup/<session-id>/`. The manifest's `agentInstructions` field
points to the adjacent `AGENTS.md`, and successful setup prints its path.
Load that file alongside harness and project instructions before agent work.
It records intent and does not replace project-owned instructions or grant
authority. Setup never rewrites a project's tracked `AGENTS.md`.

Session start always refreshes safe default clones. The legacy `--refresh` flag
is accepted without an extra fetch. This exception permits synchronization,
never implementation in the default clone. Standalone worktree creation retains
its explicit refresh behavior. Fetch and fast-forward failures are reported as
skipped; bootstrap does not run on skipped clones.

## Portable continuation

The portable continuation contract, including storage authority, encryption,
leases, retries, and project metadata, is defined in
[ADR-0015](../adr/0015-supabase-only-session-state.md). Follow the provider-neutral
`save` skill for routine saves and resumes.

Keep `projects.local.yml` as the machine-local overlay. Hydrate it after remote
changes without replacing machine-specific fields. The `pnpm save:audit` flow
stores a review-only evaluation; ordinary `pnpm save` does not run an audit or
promote tentative decisions. Never put credentials or raw transcripts in a
continuation artifact.

## Inspecting self-optimization evidence

The end-to-end path is:

`SessionFinalization` -> redacted adapter input -> evaluation gates -> observation persistence -> review-only handoff.

Evidence is stored only for the session under
`docs/.scratch/setup/<session-id>/observations.jsonl`. Each line contains a
trace-scoped observation; raw prompts, transcripts, credentials, PII, and
project implementation details are excluded. Inspect this file locally when
diagnosing a session, then use the returned handoff's validation guidance and
rollback path for human review. A candidate is not an accepted or promoted
change, and this workflow never applies it automatically.

If collection is unavailable or not wanted, run setup with
`HARNESS_OPTIMIZATION_ENABLED=0`. A hook failure is recorded as a diagnostic
and does not change the primary session result. Failed safety, outcome,
artifact, or observed-state gates can leave evidence for diagnosis but produce
no handoff.

```ts
const finalization = finalize({
  sessionId: "session-1", traceId: "trace-1", projectKey: "harness", status: "success",
  prompt: { id: "prompt-1", provenance: "trace-1:prompt" },
  resolvedContext: { id: "context-1", provenance: "trace-1:context", summary: "review mode" },
  events, artifacts, feedback, observedState,
});
```

A failed session keeps evidence but cannot imply a successful handoff:

```ts
const finalization = finalize({
  sessionId: "session-2", traceId: "trace-2", projectKey: "harness", status: "failed",
  prompt: { id: "prompt-2", provenance: "trace-2:prompt" },
  resolvedContext: { id: "context-2", provenance: "trace-2:context", summary: "implementation mode" },
  events, artifacts, feedback, observedState,
});
```

Setup validates optional session tool metadata and records only its tool names in the session manifest. See [project configuration](project-configuration.md) for its location, resolution, mapping contents, and data-safety rules.
8. Explicitly validate, push, and create or update a change request. For harness changes, run the required review loop before creating the change request. Use available MCP tools first, the configured provider CLI second, and report an actionable manual fallback when neither is available.
9. After the change request is merged, explicitly verify the merged state before removing the worktree or local branch. Never implicitly push, merge, close issues, or delete worktrees.

Interrupted operations must preserve partial state and resume where safe. If scratch metadata is lost, reconstruct what can be inferred from Git and worktree state and report unknown tracker relationships rather than deleting anything.

## Harness changes

For harness changes, follow the branch, verification, review, and merge-request workflow in [contributing.md](contributing.md).
