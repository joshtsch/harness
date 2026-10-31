# Access and initialize a vault

## Select the home first

Apply [vault destination selection](../../../docs/agents/harness-memory.md#vault-destination-selection)
before repository access or scaffolding. Honor the user's selected provider;
when unspecified, present Notion and a repository with a workflow-based
recommendation. Return unresolved ownership or access gaps before initialization.

For Notion, use the [Notion layout](../../../docs/agents/notion-knowledge-layout.md)
and [provider workflow](../../../docs/agents/knowledge-providers.md), showing
the exact proposed pages and destination for review. Database support remains
pending the separate follow-up in the destination-selection contract.
Repository paths and templates below apply only after choosing a repository.

## Repository access

Follow [knowledge repository access](../../../docs/agents/harness-memory.md#knowledge-repository-access)
to obtain a verified owner, checkout/revision, guide, and wiki entry point. Use
that checkout for retrieval or the prepared external worktree for writes.
Missing access leaves the source uninspected; return the documented setup path.

## New repository vaults

For a selected repository provider, default new harness vaults to an independent
registered repository, worked on outside the harness tree in its managed external
worktree. Project-owned vaults
and dedicated topic repositories are supported. A user-supplied existing location
takes precedence. Never invent a remote, change visibility, or create an
in-harness vault as a fallback for missing registration.

Inspect the destination, confirm its owner and scope, and show the proposed
files without creating them. Follow the [dry-run-first review](../../../docs/agents/harness-memory.md#dry-run-first-memory-changes); initialize only after separate approval of the exact scaffold.
Create approved missing paths from the templates:

```text
<vault>/
  AGENTS.md
  CLAUDE.md
  raw/
  wiki/
    index.md
    log.md
    <topic>/
      index.md
  output/
  templates/
```

Copy the concept and preference templates into `templates/`. Copy the agent guide
and Claude pointer to the vault root. Seed `wiki/index.md` from the bundle-index
template, topic indexes from directory-index, and `wiki/log.md` from log. Render
placeholders to real values; reusable templates copied into `templates/` keep
their placeholders until a page is authored. YAML-quote substituted strings.

Use lowercase hyphenated topic/concept names. Validate names and resolved paths
against collisions, traversal, and existing non-vault content. Create initial
topics justified by the request; add others during ingest. The wiki root lists
topics, not every concept. Topic indexes list immediate pages/subtopics with
one-line descriptions. Cross-link overlapping subjects; keep one canonical page.

Preserve existing files and instructions on rerun. Compare before updating and
explain collisions; a conflicting guide or legacy layout needs a bounded
migration plan, not an overwrite. Ordinary initialization adds no `.obsidian/`,
plugins, embeddings, schedules, caches, or Git remotes. Plain files suffice;
Obsidian is the browsing interface, not a runtime dependency.

Check required paths, rendered guide/index values, template availability, topic
reachability, and source/link resolution. Verify a second initialization leaves
user-edited files intact. An unchanged rerun adds no log entry.
