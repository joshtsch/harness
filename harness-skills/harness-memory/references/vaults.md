# Access and initialize a vault

## Repository access

Follow [knowledge repository access](../../../docs/agents/harness-memory.md#knowledge-repository-access)
to obtain a verified owner, checkout/revision, guide, and wiki entry point. Use
that checkout for retrieval or the prepared external worktree for writes.
Missing access leaves the source uninspected; return the documented setup path.

## New vaults

Default new harness vaults to an independent registered repository, worked on
outside the harness tree in its managed external worktree. Project-owned vaults
and dedicated topic repositories are supported. A user-supplied existing location
takes precedence. Never invent a remote, change visibility, or create an
in-harness vault as a fallback for missing registration.

Inspect the destination, confirm its owner and scope, and list planned changes.
A dry run performs no writes, including logs. For authorized initialization,
create missing paths from the templates:

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

Preserve existing files and instructions on rerun. Compare before updating and
explain collisions; a conflicting guide or legacy layout needs a bounded
migration plan, not an overwrite. Ordinary initialization adds no `.obsidian/`,
plugins, embeddings, schedules, caches, or Git remotes. Plain files suffice;
Obsidian is the browsing interface, not a runtime dependency.

Check required paths, rendered guide/index values, template availability, topic
reachability, and source/link resolution. Verify a second initialization leaves
user-edited files intact. An unchanged rerun adds no log entry.

## Topic placement

Use lowercase hyphenated topic/concept names. Validate names and resolved paths
against collisions, traversal, and existing non-vault content. Create topics
justified by the request; add others during ingest. Put new concepts beneath
`wiki/<topic>/`, with an entry in that topic's `index.md`. Link the topic index
from the wiki root, which lists topics rather than individual new concepts.
Topic indexes list immediate pages/subtopics with one-line descriptions.
Cross-link overlapping subjects; keep one canonical page.

Apply this placement when adding new concepts to an existing flat wiki too.
Preserve existing pages, index entries, and accepted sources. Updating an existing
concept keeps its current path. A new topic alongside legacy pages does not
migrate the vault. Broader moves, conflicting local guides, and source-authority
cutovers need their own bounded migration scope. Preserve old links with a
concise moved-page pointer when an authorized move needs compatibility.
