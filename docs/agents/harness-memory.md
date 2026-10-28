# Harness memory contract

User-confirmed design from the October 25, 2026 interview, implemented through
[issue #103](https://github.com/joshtsch/harness/issues/103). This page owns the
memory workflow's boundaries and rollout; detailed operations live in the
[`harness-memory` skill](../../harness-skills/harness-memory/SKILL.md).

## Ownership and authority

Maintain a harness vault alongside independently owned project vaults and
standalone knowledge repositories. New harness vaults default to a separate
registered repository with working content in an external managed worktree.
Project histories and remotes stay independent. The existing in-harness wiki
remains active until its migration is approved and verified.

`knowledge-routing` selects the authoritative source and retrieval path across
all knowledge surfaces. `harness-memory` maintains a selected vault and depends
on routing when placement is unclear. Routing does not depend on memory; a vault
selection is handed back to the calling agent. Source selection never requires
putting ADRs, configuration, policy, or secure originals into a vault.

Within an authorized task, agents may retain cited, non-sensitive factual
observations and corrections at their authoritative source. Record evidence and
confirmation/capture dates; qualify uncertainty. Confirm inferred preferences and
the resolution of conflicting decisions before making them current. Existing
preference-store confirmation rules continue during the transition. Memory cannot
change project configuration or higher-level instructions automatically.

Apply [data safety](data-safety.md) to every layer. Raw means accepted source
material, not permission to retain transcripts or provider payloads. Keep only
sanitized sources in vaults; sensitive originals belong in the existing encrypted
[secure-record workflow](secure-documents.md). Session continuation and encrypted
record storage remain independent systems.

## Vault structure and promotion

New vaults contain `raw/`, `wiki/<topic>/`, `output/`, and `templates/` beneath a
shared `AGENTS.md`; `CLAUDE.md` imports that guide. `wiki/` is the OKF bundle and
each topic has an index. Outputs and source notes stay inside the selected vault.
Templates are supplied by the skill. Obsidian can browse these files without
plugins, embeddings, or a mandatory search service.

The [promotion lifecycle](../../harness-skills/harness-memory/references/promotion.md)
defines evidence gates from source intake through checked synthesis and
supersession, plus the recommendation, approval, migration, and rollback stages
for extracting a topic repository. Extraction recommendations require observed
reuse across independent projects, a concrete ownership/access need, or an
explicit portability request. Verification of a memory page grants no authority
to promote its contents into policy.

## Knowledge repository access

Use `pnpm wikis --json` from the harness root to discover registered project
wikis, plus the active harness-wiki pointer in
[documentation strategy](documentation-strategy.md#recording-and-retrieval).
Select by scope/topics and inspect content before choosing. Private inventory
stays local; topic matches do not establish access permission.

For the router's handoff, identify the registered project, configured repository,
verified checkout, applicable guide, wiki index/path, and branch or revision.
Check checkout identity before reading and distinguish its default clone from an
active session worktree. An accessible checkout may be read without provisioning
or fetching; note relevant freshness limitations. Missing/inaccessible content
cannot be treated as inspected. Return the precise setup/access blocker.

For missing repositories use [intake](repository-intake.md) and
[clone restoration](session-lifecycle.md#initialization-and-project-clones).
For writes use the owning repository's
[session lifecycle](session-lifecycle.md) and contribution rules. Do not write
through the inventory's default-clone path or bypass denied access. This guide
routes to those procedures rather than creating a second clone/auth/worktree
workflow. After access, the memory skill handles topic navigation and content.

Resolve configured `wiki.pages`, `wiki.raw`, and `wiki.templates` against the
verified repository root, including symlink resolution, and keep access inside
that repository. These paths remain metadata rather than copies of its content.
For the new root-vault layout they are `wiki`, `raw`, and `templates`; `output`
is their sibling. Existing layouts and local guides remain active until migration.

## Migration preview

This rollout installs the new skill and capability route. It retires the old
initializer route while retaining general routing. It does not provision a new
vault or move, delete, synchronize, or duplicate existing memory data.

| Current source | Target after separately authorized migration | Cutover condition |
| --- | --- | --- |
| `docs/llm-wiki-harness/raw/`, `wiki/`, `templates/` | Equivalent directories in a registered external harness vault; concepts grouped by topic | Destination verified, old-to-new links mapped, and harness retrieval pointers updated together |
| Existing registered child wikis | Their existing repositories; optionally adopt the new layout and OKF templates | Each owner approves its bounded migration and verifies consumer retrieval |
| Local decision-memory JSON | Scoped `Preference` concepts in a selected non-sensitive vault | Confirm values/scope, preserve rationale/provenance/review dates, verify precedence, then switch callers and authority once |
| Legacy initializer implementations | Retained installation/history, unavailable as harness routes | `harness-memory` is the canonical route; do not uninstall unrelated global skills |
| Session checkpoints and secure records | Existing systems | No migration in this change |

Before applying a migration, name the destination repository, visibility, owner,
and registered project. Inventory actual source paths and records within the
authorized scope; inaccessible sources remain explicitly uninspected. Produce a
path map, duplicate/conflict decisions, source-rights/privacy review, consumer
list, checks, and rollback steps. Preserve accepted sources and old logs. Capture
baseline revisions and content hashes where useful for preservation proof.

During preview, the legacy wiki and local preference store remain authoritative.
Do not dual-write preferences or claim vault preference lookup exists yet. The
existing CLI retains scope matching, stale/conflict behavior, confirmation, and
atomic-write safeguards. After a future cutover, retire its callers in the same
reviewed change; a template alone is not an implemented preference backend.

Copy before cutover, verify lineage/links/indexes and representative retrieval,
then switch discovery and consumers as one reviewed change. Retain old sources
for rollback with moved-location pointers. If validation fails, keep old routing;
if destination edits occurred later, reconcile them before restoring old
authority. Deleting superseded files requires a separate bounded cleanup.

## Behavioral evaluation

Run `pnpm evaluate:harness-memory prepare [skill-directory]` to create a disposable
snapshot and seven isolated cases. Have agents independent of the skill author run
the generated `runs/<case>/prompt.md` files, limiting writes to each fixture and
response file. Use the same cases, order, and model settings for baseline and
candidate skills; keep the variants' agent contexts separate and their results
hidden from each other. No live accounts or vaults are
needed. Fixtures and transcripts stay outside the repository.

Then run `pnpm evaluate:harness-memory check <evaluation-root>`. A nonzero exit
means a filesystem or generated-metadata check failed. A zero exit establishes
only those checks: independently review each response/artifact against the case
rubric before claiming behavioral success. Compare entry-point words/bytes,
source preservation, read-only behavior, configured-path retrieval, provenance,
preference confirmation, sensitive-input handling, and promotion reasoning.
Keep real regressions as cases; do not grade phrasing or demand an exact answer
string. One paired run is a regression sample, not proof of general equivalence.
