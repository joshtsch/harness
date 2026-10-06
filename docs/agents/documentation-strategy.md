# Documentation Strategy

Use one authoritative surface for each kind of knowledge. Link related surfaces; do
not copy the same decision into several documents.

| Knowledge | Authoritative surface |
| --- | --- |
| Agent rules | `AGENTS.md` and applicable skill files |
| Domain vocabulary | `CONTEXT.md` |
| Harness workflow and policy | `docs/agents/` |
| Architectural trade-offs | `docs/adr/` |
| General harness and cross-project knowledge | `docs/llm-wiki-harness/wiki/` |
| Project or tool configuration | `projects.yml`, `.codex/config.toml` |
| Work intent and acceptance context | Configured issue tracker |
| Branch implementation, review, and verification | Change request |
| Local rationale | Focused code comment |
| Behavioral contract | Tests |

## Recording workflow

1. Classify the information before writing it.
2. Write the decision to its authoritative surface.
3. Link supporting or dependent surfaces instead of duplicating the decision.
4. Update `CONTEXT.md` when terminology changes.
5. Create an ADR only for a hard-to-reverse, surprising trade-off.
6. Keep transient handoffs and recovery metadata in ignored `docs/.scratch/`.
7. Run `pnpm check:docs` before review.

The agent-facing wiki uses concise Caveman prose in maintained pages. Preserve original
wording in `docs/llm-wiki-harness/raw/` and `docs/llm-wiki-harness/templates/`.

## Enforcement

`pnpm check:docs` verifies the required documentation surfaces and rejects the removed
legacy root wiki paths. `/code-review` checks new decision-bearing files against this
strategy and reports misplaced, duplicated, or missing documentation.
