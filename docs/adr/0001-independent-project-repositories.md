# Independent Project Repositories

The harness coordinates independent Git repositories rather than owning a monorepo. This preserves each project's remote, branches, history, and tooling while allowing one session to work across project boundaries; cross-project relationships belong in session metadata.

## Consequences

The harness must resolve and report project-specific configuration, and it cannot provide atomic Git commits across projects.
