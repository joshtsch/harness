# Promotion and maintenance

## Content lifecycle

Every durable transition below requires [dry-run-first review and approval](../../../docs/agents/harness-memory.md#dry-run-first-memory-changes).
Task authorization permits preparing the proposal; the table describes approved
writes.

| Stage | Entry and exit evidence | Authority |
| --- | --- | --- |
| Source intake | Classify scope/sensitivity; retain a sanitized capture or secure-record reference with source URI and capture date. | Approved capture; sensitive originals use encrypted storage. |
| Accepted source | A durable source in `raw/` has identified provenance and is immutable. New evidence is a new source. | Acceptance establishes provenance, not truth. |
| Draft synthesis | Create/update topic concepts with `status: draft`, source IDs, claim citations, uncertainty, and related links. | Cited factual drafting proceeds after proposal review and approval. |
| Checked knowledge | Validate claims against accessible evidence, scope, citations, and contradictions; record real verifier/time and set `status: stable` when usable. | Machine checks are machine verification. Record human review only when it happened; confirm inferred preferences and conflicting decisions with the user. |
| Derived output | Produce the requested artifact with a source/revision note under `output/`. | Approved proposal permits the artifact; output generation adds no verification. |
| Review or supersession | A due `stale_after`, changed evidence, or contradiction triggers review. Qualify affected claims. Mark superseded concepts `deprecated` and link replacements. | Preserve history and surface unresolved state during retrieval. |

New claims on a stable page are draft until checked. Preserve verification only
for unchanged claims it covers; meaningful rewrites need rechecking before
page-level verification represents current content. Retain contradictory
evidence; ask before choosing between conflicting decisions. Memory-to-policy or
configuration promotion is a separate reviewed change at its authoritative
surface, never an automatic consequence of wiki verification.

Log content changes under ISO date headings, newest first, preserving previous
entries. Migration keeps an old chronological log as historical evidence rather
than silently reformatting it.

## Topic promotion

A topic may remain a directory indefinitely. Evaluate a recommendation after
ingest or maintenance when at least one observable trigger occurs:

- **Reuse:** at least two independent projects used or requested the same coherent
  topic. Cite both uses; do not infer demand from a topic label.
- **Boundary:** a distinct owner, review cadence, distribution, or access boundary
  is needed. State the concrete requirement and current mismatch.
- **Portability:** the user asks to reuse, share, or maintain the topic as an
  independent knowledge repository.

Counts alone are insufficient. An unwieldy index or repeated irrelevant retrieval
prompts directory/index refinement first. Recommend extraction when it gives the
topic a useful independent purpose and maintainable owner. For an urgent access
mismatch, stop affected sharing and report it immediately; a new repository does
not repair existing exposure.

| State | Required transition evidence |
| --- | --- |
| Embedded topic | Topic directory with scope and canonical pages. |
| Candidate | One trigger with dated evidence; independent purpose, proposed owner, consumers, dependencies, and expected benefit. |
| Recommended | Proposed repository identity/visibility, included/excluded paths, access constraints, source rights, link plan, validation, rollback, and cost. Record once; revisit on material new evidence or user request. |
| Approved | User authorizes concrete repository/migration scope; wider publication and access permissions remain separate. |
| Registered and prepared | Complete repository intake and owning repository workflows; validate merged configuration and destination access before provisioning/migration. |
| Migrated and verified | Copy bounded content with lineage and an old-to-new path map; validate templates, sources, indexes, links, privacy, and representative consumer retrieval. Preserve prior content until verified. |
| Active standalone vault | Switch discovery and consumers to the verified destination, mark old entry points as moved, and stop writes to superseded copies. One source is authoritative. |
| Rollback or retirement | On failed verification retain the old source and revert routing. On later rollback reconcile destination edits before restoring authority. Remove old content only through authorized cleanup after accounting for links/consumers. |

Recommend in the operation report. Save a sanitized candidate in the topic's
indexed concept page only after separate approval of its dry run; otherwise
return it unsaved in conversation. A recommendation alone creates no issue,
repository, schedule, or message. The current rollout stops at a preview.
