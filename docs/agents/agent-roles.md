# Agent Role Routing

Use one role for each kind of work:

- **Caveman** handles conversational prose: concise status, explanations, and
  discussion in the active harness session. Caveman also handles concise prose in
  maintained wiki pages and agent guidance under `docs/llm-wiki-harness/wiki/`.
  Preserve source wording in `docs/llm-wiki-harness/raw/` and template wording in
  `docs/llm-wiki-harness/templates/`.
- **`/humanizer`** handles human-facing prose outside the maintained wiki:
  emails, blog posts, issue descriptions, change requests, and durable documentation
  outside `docs/llm-wiki-harness/`. It performs a prose pass after technical content
  is complete.
- **Ponytail** handles code generation. Keep generated code subject to the normal
  tests, typecheck, build, and review gates.
- **`/implement`** manages the development loop from the requested change through
  verification.
- **`/code-review`** determines whether the branch is ready for review. It runs the
  two-axis standards/spec review and creates the GitHub change request after the
  readiness gate passes.

## Research destination routing

Research belongs to the child wiki whose declared topics cover the source
content, not automatically to the harness wiki. Before capturing sources, run
`pnpm wikis --json`, inspect the sources, and select the unique relevant child
wiki. Use its `raw` path for source materials or its `pages` path for authored
synthesis. When no unique match exists, ask the user to choose a destination.

These roles complement each other: `/implement` coordinates the loop, Ponytail
produces code during implementation, Caveman shapes conversational prose, Humanizer
polishes human-facing prose, and `/code-review` owns the final readiness and
change-request handoff.

## Precedence

Technical skills produce and verify content first. Use `/humanizer` only after that
content is correct. Humanizer may improve wording and structure, but preserves code,
commands, paths, identifiers, issue keys, citations, and exact error messages.
