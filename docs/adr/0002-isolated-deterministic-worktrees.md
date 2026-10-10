# Isolated Deterministic Worktrees

All child-project work is performed in harness-managed worktrees under `.worktrees/`, never in a project's main clone or default branch. Worktree and branch names are deterministic from project and issue identity plus a normalized ticket title, with explicit suffixes for parallel attempts.

## Consequences

The harness must verify the default branch is fetched, current with its remote, and clean before creating a worktree, and must make cleanup explicit and recoverable.

Session startup may synchronize a clean default clone by fetching and
fast-forwarding before setup. Dirty or divergent clones are preserved; all
implementation stays in worktrees.
