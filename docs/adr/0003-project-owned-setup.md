# Project-Owned Setup

Each project owns a standalone `scripts/setup.sh`; the harness invokes it by explicit phase while retaining ownership of worktree preparation and verification policy. This keeps repository-specific tooling with the repository and lets projects initialize correctly outside the harness.

## Consequences

Setup scripts are trusted project code and must be deterministic, idempotent, observable, and safe to rerun. The harness must pass a stable execution context rather than embedding project-specific commands.
