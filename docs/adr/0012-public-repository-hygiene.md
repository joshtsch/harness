# ADR-0012: Public repository hygiene and private project configuration

**Status**: Accepted; publication approach revised October 6, 2026
**Date**: September 27, 2026
**Authors**: User and Codex
**Tags**: privacy, repository, configuration, release

## Context

The historical harness repository contains private project context in prior Git
history and GitHub tracker records. Sanitizing ordinary branches does not remove
GitHub's retained pull-request references. The user chose a fresh public
repository rather than requesting removal of historical records from GitHub.

This revision replaces the original decision to publish the same repository
with rewritten history. The public/local configuration boundary remains.

## Decision

Rename the existing repository to `joshtsch/harness-private-archive` and keep it
private. Establish the ongoing development repository at `joshtsch/harness`
from an audited publication snapshot of final `main`.

- Resolve every open merge request before exporting the snapshot.
- Start fresh Git history with one initial commit. Publish only `main`; do not
  copy historical refs, issues, pull requests, comments, or private Git metadata.
- Keep tracked `projects.yml` limited to public defaults. Keep installation
  metadata in ignored `projects.local.yml`; validate the merged configuration.
- Keep private configuration, credentials, secure records, scratch state, child
  projects, generated files, and local infrastructure state outside the export.
- Preserve the historical repository privately. Make it read-only only after
  the fresh repository passes verification.
- Store an encrypted rollback mirror outside both repositories in
  `~/harness-backups/` for 30 days after publication. Keep an explicit encrypted
  Bitwarden backup of local configuration separately. Verify recovery before
  cutover; the private historical archive is retained independently of the
  temporary rollback mirror.
- Use the existing HCP Terraform workspace and locked remote state. Preserve
  the existing GitHub resource identity for the private archive and add a
  separate resource for the fresh repository. Keep the continuation backend.
- Retarget the historical clone to the archive before reusing `harness`. Rename
  redirects stop working once the old name is reused. Never attach the old Git
  history to the new remote; initialize the development home from a fresh clone.
- Create the replacement privately for staging. Audit all exported content and
  the initial commit, run repository quality gates and two-axis review, then
  verify an independent clone before the final user-controlled visibility change.
- Enable and verify GitHub private vulnerability reporting after publication.
  Before then, security reports use the repository owner's private GitHub
  contact path described in `SECURITY.md`.

## Consequences

The public repository keeps the name `harness` and receives the complete working
source snapshot. Private history remains available to its owner without needing
GitHub Support cleanup. Public commit history and tracker records start fresh.
Old issue and pull-request links must point to the private archive; public readers
may not have access. Existing clones and worktrees retain their historical remote
and must never push to the new repository. Local installation state moves
separately from the audited source snapshot.

## Alternatives considered

### Publish the existing repository after history cleanup

Rejected in this revision. Historical pull-request references and cached views
need additional GitHub cleanup, and the user prefers a fresh public repository.

### Squash the existing repository in place

Rejected because ordinary history replacement does not remove historical
pull-request references or tracker metadata.

### Copy only selected harness features

Rejected for this release. The user wants the complete working harness, not a
smaller starter with a different dependency and documentation boundary.

### Store private installation metadata in tracked configuration

Rejected. Public configuration must not disclose private project inventory.
Bitwarden remains explicit backup/restore storage, not a runtime dependency.

## References

- [Public release checklist](../public-release-checklist.md)
- [Infrastructure migration](../../infrastructure/README.md)
- [Configuration boundary](../agents/project-configuration.md)
- [Data safety](../agents/data-safety.md)
- [GitHub sensitive-data cleanup](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [GitHub repository rename](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
