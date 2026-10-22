# Documentation Strategy

Use one authoritative surface for each kind of knowledge. Link related surfaces; do
not copy the same decision into several documents.

For placement decisions, use the harness [`knowledge-routing` skill](../../harness-skills/knowledge-routing/SKILL.md). This table remains the authority for which surface owns each knowledge type; the skill applies it to scope, context layer, and activation path.

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

## Recording and retrieval

1. Classify the information before writing it.
2. Write the decision to its authoritative surface.
3. Link supporting or dependent surfaces instead of duplicating the decision.
4. Update `CONTEXT.md` when terminology changes.
5. Create an ADR only for a hard-to-reverse, surprising trade-off.
6. Keep transient handoffs and recovery metadata in ignored `docs/.scratch/`.
7. Run `pnpm check:docs` before review.

For newly learned operational facts and user corrections, record the source and
confirmation date with the fact, and ensure later work can retrieve it through
the relevant project configuration, index, or focused documentation pointer.
Distinguish user-confirmed facts from independently verified observations; label
uncertain claims before relying on them. Update an existing authoritative record
when correcting a fact. Follow the applicable contribution and write-authorization
gates; when capture is blocked, report the blocker and keep the fact provisional
in session scratch.

Keep private domain, account, and provider mappings in the ignored project
configuration overlay and its encrypted portable record. Keep credentials in
external custody or environment configuration. Apply
[Secrets and PII safety](data-safety.md) before writing provenance or facts.
The public harness records general rules and procedures; project-specific facts
belong with their owning project.

To retrieve harness wiki knowledge, read `docs/llm-wiki-harness/wiki/index.md`
and search the wiki pages under that directory. For child wiki knowledge, run
`pnpm wikis --json`, match the declared topics, then inspect the selected wiki's
index and pages. If its configured repository checkout is missing or unreadable,
mark inspection blocked and placement provisional. Do not infer page contents or
claim the wiki was reviewed; state the setup or access needed before finalizing.

The agent-facing wiki uses concise Caveman prose in maintained pages. Preserve original
wording in `docs/llm-wiki-harness/raw/` and `docs/llm-wiki-harness/templates/`.

## Enforcement

`pnpm check:docs` verifies the required documentation surfaces and rejects the removed
legacy root wiki paths. `/code-review` checks new decision-bearing files against this
strategy and reports misplaced, duplicated, or missing documentation.
