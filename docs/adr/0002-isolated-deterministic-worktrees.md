# Isolated Deterministic Worktrees

All child-project work is performed in harness-managed worktrees, never in a project's main clone or default branch. Worktree names and newly generated branch names are deterministic from project and issue identity plus a normalized ticket title, with explicit suffixes for parallel attempts. An explicitly selected existing branch can be attached while preserving the issue-derived worktree name. The original internal `.worktrees/` location is superseded by the amendment below.

## Consequences

The harness must verify the default branch is fetched, current with its remote, and clean before creating a worktree, and must make cleanup explicit and recoverable.

Session startup may synchronize a clean default clone by fetching and
fast-forwarding before setup. Dirty or divergent clones are preserved; all
implementation stays in worktrees.

## External root amendment — October 9, 2026

New worktrees live outside the harness tree so independent project code stays
outside the orchestration checkout. Use the [configured external root](../agents/project-configuration.md#worktree-root);
resolve physical paths to reject internal roots and symlink aliases. Shared
project Git configuration records the owning harness for discovery from an
external worktree.

Existing internal worktrees remain registered and untouched. Migration requires
an explicitly authorized Git move with verification and reversible session-path
updates. Follow [existing worktree guidance](../agents/session-lifecycle.md#existing-worktrees).
Deterministic naming, independent histories, and explicit cleanup still apply.
