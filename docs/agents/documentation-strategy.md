# Documentation Strategy

Use one authoritative surface for each kind of knowledge. Link related surfaces; do
not copy the same decision into several documents.

For placement decisions, use the harness [`knowledge-routing` skill](../../harness-skills/knowledge-routing/SKILL.md). This table remains the authority for which surface owns each knowledge type; the skill applies it to scope, context layer, and activation path.

For selected-vault operations use [`harness-memory`](../../harness-skills/harness-memory/SKILL.md).
Select a new vault's provider through
[destination selection](harness-memory.md#vault-destination-selection) before
repository or Notion setup. Its [contract and migration preview](harness-memory.md)
preserve independent wiki repositories and general source routing. Registered
vault metadata resolves active
knowledge sources; retained in-harness wiki pages are historical rollback copies.

| Knowledge | Authoritative surface |
| --- | --- |
| Agent rules | `AGENTS.md` and applicable skill files |
| Domain vocabulary | `CONTEXT.md` |
| Harness workflow and policy | `docs/agents/` |
| Information classification, access, and processing boundaries | [data-safety.md](data-safety.md) |
| Architectural trade-offs | `docs/adr/` |
| General harness and cross-project knowledge | Registered harness vault, discovered with `pnpm wikis --json` |
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

Private contact facts remain in their authoritative controlled source under the
[Private-source routing design](harness-memory.md#private-source-routing).
General vaults retain sanitized knowledge only. Approval of this design does not
activate a Private source or supply an implemented retrieval path.

Discover active harness knowledge with `pnpm wikis --json`. Select the registered
harness vault by its scope and topics, verify its checkout, then inspect its guide
and configured wiki index before retrieval. If the vault is missing, inaccessible,
or ambiguous, report the setup/access gap; do not treat historical copies as current.
Follow [knowledge repository access](harness-memory.md#knowledge-repository-access);
for reading and maintenance use `harness-memory`. Prose ownership remains in
[agent role routing](agent-roles.md).

Source-backed knowledge does not require a Git repository. Discover authorized
Notion sources through the [knowledge gateway](knowledge-providers.md), alongside
the existing repository-wiki inventory. Private provider content remains in its
controlled source and requires verified host, source, and processor grants;
registration alone does not activate retrieval. Chats may select several sources
without widening any source's grants or authorizing writes between them.

## Enforcement

`pnpm check:docs` verifies the required documentation surfaces and rejects the removed
legacy root wiki paths. Retained in-harness wiki pages must declare their historical
status and point to registered-vault discovery. Their local links and reachability
remain checked; public CI does not require a private vault checkout.
`/code-review` checks new decision-bearing files against this
strategy and reports misplaced, duplicated, or missing documentation.
