# Harness memory contract

User-confirmed design from the October 25, 2026 interview, implemented through
[issue #103](https://github.com/joshtsch/harness/issues/103). This page owns the
memory workflow's boundaries and rollout; detailed operations live in the
[`harness-memory` skill](../../harness-skills/harness-memory/SKILL.md).

## Ownership and authority

Maintain a harness vault alongside independently owned project vaults and
standalone knowledge repositories. Choose a vault's provider before entering
repository or Notion setup, using [destination selection](#vault-destination-selection).
Repository vaults use registered repositories with working content in external
managed worktrees. Project histories and remotes stay independent. After an
approved and verified cutover, the registered harness vault owns current knowledge. Retained in-harness
wiki pages are historical rollback copies and must not receive new knowledge.

`knowledge-routing` selects the authoritative source and retrieval path across
all knowledge surfaces. `harness-memory` maintains a selected vault and depends
on routing when placement is unclear. Routing does not depend on memory; a vault
selection is handed back to the calling agent. Source selection never requires
putting ADRs, configuration, policy, or secure originals into a vault.

Retain cited, non-sensitive observations and corrections at their authoritative
source only after the review and approval below. Record evidence and
confirmation/capture dates; qualify uncertainty. Confirm inferred preferences and
the resolution of conflicting decisions before making them current. Memory cannot
change project configuration or higher-level instructions automatically.

Apply [data safety](data-safety.md) to every layer. Raw means accepted source
material, not permission to retain transcripts or provider payloads. Keep only
sanitized sources in vaults; Restricted originals belong in the existing encrypted
[secure-record workflow](secure-documents.md). Session continuation and encrypted
record storage remain independent systems.

## Vault destination selection

Agreed in the October 31, 2026 design interview; stage one is tracked in
[issue #121](https://github.com/joshtsch/harness/issues/121).

For a new vault, knowledge space, or knowledge source, identify its owner,
purpose, editing workflow, and access needs before provider-specific setup.
Honor an explicit destination. Otherwise present both Notion and a repository,
recommend a home using the criteria below, and ask only for unresolved details
that affect the choice. Reuse an existing home when it fits and the user selects it.

| Prefer Notion | Prefer a repository |
| --- | --- |
| Frequent human editing and collaboration | Knowledge changes alongside code |
| Structured records, filters, and views | Git review and versioned file changes |
| Native page navigation | Local files, portability, or reproducible tooling |

Weigh the actual workflow rather than treating any one criterion as mandatory.
Classification and access requirements can rule out either provider. Separate
destination suitability from available create, read, and maintain capabilities.
Show a suitable Notion home even when activation is missing; state the exact
setup gap and offer setup or an alternative without silently choosing Git.
An explicit choice needs no further provider comparison.

Each vault has one authoritative home. Exports are snapshots. When an idea
becomes a Project, keep implementation and delivery work in that Project and
link its originating idea. Transfer knowledge ownership explicitly when needed;
avoid maintaining duplicate current copies.

Repository handoffs identify the registered owner, checkout, guide, index, and
revision, or their missing setup. Notion handoffs identify the selected root,
owner, classification, layout, and available capabilities or setup blockers.
Use [repository access](#knowledge-repository-access) for the repository branch.
Use [Notion layout](notion-knowledge-layout.md) and
[provider access and activation](knowledge-providers.md) for the Notion branch;
approved writes need a separately authorized write workflow. Neither selection
nor a connected plugin activates access or authorizes initialization.

### Database support: separate follow-up

The target Notion design supports databases where structured records help,
alongside ordinary pages. Database properties and page content may both inform
answers; scoped queries must filter and paginate, preserve provenance and
revision/retrieval times, and enforce eligible records and properties before
returning content. Views organize human navigation and do not define access.
Relations and linked content require their own authorized scope.

The agreed target is scoped live reads of new and edited records without
approval of every revision. Designing and verifying that authorization mechanism
is a separate implementation effort. Current retrieval remains limited to
explicitly reviewed ordinary pages and exact revisions; database ancestry,
properties, and querying are unsupported. Keep current activation, review, and
memory-write approval gates until their replacements are implemented and
verified. Stage-one routing does not create a vault or activate a connection.

## Private-source routing

The accepted [information-classification design](data-safety.md#information-classification)
keeps Private contact facts in their authoritative source. Memory routes scoped
queries to that source rather than retaining a second copy in a general vault.
This extends retrieval, not the kinds of payload a vault or local preference
store may retain. Keep identifying source mappings and references in appropriately
private configuration or storage; opaque identifiers are not automatically safe
for public files.

The [knowledge gateway](knowledge-providers.md) implements reviewed Notion page
reads and personal/session/processor grant checks. Trusted native host binding
and live source activation remain setup prerequisites. Before activation, apply the
[source, scope, and processor gates](data-safety.md#access-and-processing-boundaries)
and verify enforcement before content reaches the agent. A broad connector does
not become a scoped memory backend because an agent uses a filtered query.

An explicit request to remember a Private contact fact prepares an exact update
proposal for its authoritative Private source, including destination, evidence,
and validation. Saving requires the separate review below, plus the source's
write authorization. Do not save the proposal, its PII, or a duplicate contact
record into general vaults, local decision memory, logs, or scratch state.
Sanitized conclusions still require classification and the normal memory review.

## Dry-run-first memory changes

Every proposed durable memory change starts with an unsaved dry run. This covers
vault content, saved preferences, self-optimization observations and suggestions,
and explicit "remember this" requests, including replacements and deletions. The
initial request authorizes preparation; saving requires separate user approval
after the user reviews the proposal. Standing instructions or earlier approvals
cannot bypass that review.

Show the exact proposed content and destination, supporting evidence, and
validation results. For replacements and deletions, identify the existing content
affected. Keep the proposal in the active review channel. The first pass performs
no filesystem or external writes: it must not save proposal files, create indexes
or logs, acquire persistent locks, initialize destinations, or persist observations
or candidate improvements. Retrieval and validation must remain read-only.

Approval applies only to the content and destination shown. Changes to either, or
to relevant existing memory state, invalidate approval; produce a fresh dry run
and obtain approval again. One confirmation may approve an explicitly listed
batch whose items and destinations were all shown. Each item still requires its
normal validation and write checks, and unlisted changes remain unapproved.

Executable apply paths bind approval to the reviewed proposal and relevant
existing state with proposal fingerprints. Destinations resolve through existing
filesystem ancestors without creating missing paths; repointed symbolic links
require fresh review, and unresolved links fail closed. A fingerprint establishes which
proposal the approval covers; it does not authenticate the user's identity or
replace the agent's responsibility to obtain actual user confirmation.

Unattended runs, including session-finalization hooks, return unsaved proposals
for display through an available review channel. Without a review channel, skip
capture. Leave no pending proposal files or logs of proposal contents for later.

Approval supplements existing privacy, scope, repository, contribution, and
preference-store safeguards. A reviewed proposal must pass those checks before
any approved write; review grants no authority to bypass them.

A migration preview is a memory proposal even when it resembles a report.
The `output/` convention does not authorize saving an initial proposal. After
review, an approved report or export may be saved with its provenance in the
selected source's permitted output destination. Private outputs require a
controlled destination; a general vault directory is not sufficient. Ordinary
answers stay in chat unless saving is requested. See
[provider outputs](knowledge-providers.md#saved-outputs-and-migration).

## Vault structure and promotion

New repository vaults contain `raw/`, `wiki/<topic>/`, `output/`, and `templates/`
beneath a shared `AGENTS.md`; `CLAUDE.md` imports that guide. `wiki/` is the OKF bundle and
each topic has an index. Outputs and source notes stay inside the selected vault.
Templates are supplied by the skill. Notion vaults use the provider-specific
layout linked above. Obsidian can browse repository files without
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

The initial rollout installed the new skill and capability route and retired the
old initializer route while retaining general routing. Each data migration needs
its own reviewed scope. After an approved wiki cutover, current harness knowledge
is retrieved through registered vault metadata; historical copies remain for
rollback. Private repository identities stay in local configuration and its
encrypted portable record, not public guidance.

| Current source | Target after separately authorized migration | Cutover condition |
| --- | --- | --- |
| Retained `docs/llm-wiki-harness/` content | Registered external harness vault with topic-organized concepts and preserved raw snapshots | Verified copy precedes approved cutover; discovery and consumer pointers switch together; old pages become historical |
| Existing registered child wikis | Their existing repositories; optionally adopt the new layout and OKF templates | Each owner approves its bounded migration and verifies consumer retrieval |
| Local decision-memory JSON | Scoped `Preference` concepts in a selected non-sensitive vault | Confirm values/scope, preserve rationale/provenance/review dates, verify precedence, then switch callers and authority once |
| Legacy initializer implementations | Retained installation/history, unavailable as harness routes | `harness-memory` is the canonical route; do not uninstall unrelated global skills |
| Session checkpoints and secure records | Existing systems | No migration in this change |

Before applying a migration, name the destination provider and authoritative
home, visibility, owner, and registered project or source as applicable.
Inventory actual source paths and records within the
authorized scope; inaccessible sources remain explicitly uninspected. Produce a
path map, duplicate/conflict decisions, source-rights/privacy review, consumer
list, checks, and rollback steps. Preserve accepted sources and old logs. Capture
baseline revisions and content hashes where useful for preservation proof.

Before cutover approval, existing retrieval remains authoritative. A wiki cutover
changes only wiki retrieval; the local preference store remains authoritative.
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
snapshot and isolated cases, including provider selection. Have agents independent
of the skill author run the generated `runs/<case>/prompt.md` files, limiting writes to each fixture and
response file. Use the same cases, order, and model settings for baseline and
candidate skills; keep the variants' agent contexts separate and their results
hidden from each other. No live accounts or vaults are
needed. Fixtures and transcripts stay outside the repository.

All cases exercise the initial request without post-preview approval; the
vault must remain unchanged even for ingest, initialization, and remember
requests. Inspect the unsaved proposals in the evaluation transcripts for exact
content, destinations, evidence, validation, and a request for separate approval.
Executable approved-write behavior has separate regression tests.

Then run `pnpm evaluate:harness-memory check <evaluation-root>`. A nonzero exit
means a filesystem or generated-metadata check failed. A zero exit establishes
only those checks: independently review each response/artifact against the case
rubric before claiming behavioral success. Compare entry-point words/bytes,
source preservation, read-only behavior, configured-path retrieval, provenance,
preference confirmation, sensitive-input handling, and promotion reasoning.
Keep real regressions as cases; do not grade phrasing or demand an exact answer
string. One paired run is a regression sample, not proof of general equivalence.
