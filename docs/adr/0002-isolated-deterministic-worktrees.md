# Isolated Deterministic Worktrees

All child-project work is performed in harness-managed worktrees under `.worktrees/`, never in a project's main clone or default branch. Worktree names and newly generated branch names are deterministic from project and issue identity plus a normalized ticket title, with explicit suffixes for parallel attempts. An explicitly selected existing branch can be attached while preserving the issue-derived worktree name.

## Consequences

The harness must verify the default branch is fetched, current with its remote, and clean before creating a worktree, and must make cleanup explicit and recoverable.
