# Documentation Strategy

Use one authoritative surface for each kind of knowledge. Link related surfaces; do
not copy the same decision into several documents.

For placement decisions, use the harness [`knowledge-routing` skill](../../harness-skills/knowledge-routing/SKILL.md). This table remains the authority for which surface owns each knowledge type; the skill applies it to scope, context layer, and activation path.

For selected-vault operations use [`harness-memory`](../../harness-skills/harness-memory/SKILL.md).
Its [contract and migration preview](harness-memory.md) preserve independent wiki
repositories and general source routing. The paths below remain active until an
approved data migration changes their retrieval pointers.

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
2. Use the applicable write workflow for the authoritative surface, as described below.
3. Link supporting or dependent surfaces instead of duplicating the decision.
4. Update `CONTEXT.md` when terminology changes.
5. Create an ADR only for a hard-to-reverse, surprising trade-off.
6. Keep non-memory transient handoffs and recovery metadata in ignored `docs/.scratch/`.
7. Run `pnpm check:docs` before review.

Ordinary policy, code, and documentation edits follow the normal
[contribution workflow](contributing.md). Memory capture, including corrections
to existing memory, follows [dry-run-first review and approval](harness-memory.md#dry-run-first-memory-changes).
Keep unapproved memory proposals in the active review channel, without saving
them to scratch. A requirement to record facts before dependent work does not
authorize a memory write; while approval is pending, treat the fact as provisional
in the active session and state that limitation when relying on it.

For newly learned operational facts and user corrections, include the source and
confirmation date in the proposed record. Distinguish user-confirmed facts from
independently verified observations; label uncertain claims before relying on
them. After an approved write, ensure later work can retrieve the fact through
the relevant project configuration, index, or focused documentation pointer.
When capture is blocked, report the blocker and keep the proposal unsaved.

Keep private domain, account, and provider mappings in the ignored project
configuration overlay and its encrypted portable record. Keep credentials in
external custody or environment configuration. Apply
[Secrets and PII safety](data-safety.md) before writing provenance or facts.
The public harness records general rules and procedures; project-specific facts
belong with their owning project.

The active harness-wiki entry point is `docs/llm-wiki-harness/wiki/index.md`.
For additional repositories follow [knowledge repository access](harness-memory.md#knowledge-repository-access);
for reading and maintenance use `harness-memory`. Prose ownership remains in
[agent role routing](agent-roles.md).

## Enforcement

`pnpm check:docs` verifies the required documentation surfaces and rejects the removed
legacy root wiki paths. `/code-review` checks new decision-bearing files against this
strategy and reports misplaced, duplicated, or missing documentation.
