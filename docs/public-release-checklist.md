# Public release checklist

Publish a fresh repository from an audited snapshot. The historical repository
stays private. See [ADR-0012](adr/0012-public-repository-hygiene.md) for the decision.

## Preparation

- [ ] Resolve every open merge request in the historical repository.
- [ ] Record the final source `main` commit and inventory repository refs.
- [ ] Verify the encrypted Bitwarden backup of `projects.local.yml`.
- [ ] Encrypt a rollback mirror in `~/harness-backups/` and verify decryption.
- [ ] Retain the rollback mirror for 30 days after publication; record the due date privately.
- [ ] Keep a reviewed Terraform plan in protected temporary storage with locked remote state.

## Cutover

- [ ] Preserve the existing Terraform resource identity for the historical repository; add a separate resource for the new repository.
- [ ] Keep `harness-private-archive` private throughout the migration.
- [ ] Retarget historical clones and shared worktrees to the archive remote before reusing `harness`.
- [ ] Rename the existing repository and create a fresh private staging repository named `harness`.
- [ ] Export only audited tracked content into fresh Git history; inherit no historical refs or tracker records.
- [ ] Keep private configuration, credentials, secure records, scratch state, child projects, generated artifacts, and local Terraform state outside the export.
- [ ] Update historical issue links to the private archive; remove stale public tracker references from exported guidance.
- [ ] Push one initial commit on `main` only.

## Verification

- [ ] `projects.yml` contains public defaults and the public configuration validates without a local overlay.
- [ ] LICENSE, SECURITY.md, CONTRIBUTING.md, and README describe the exported repository accurately.
- [ ] Audit every exported file and the initial commit for private context and credentials. A staged-diff scanner alone is insufficient.
- [ ] Tests, typecheck, build, documentation, Markdown, and sensitive-content checks pass.
- [ ] Two-axis review has no unresolved actionable findings.
- [ ] An independent fresh clone has only the intended source snapshot and public refs.
- [ ] Establish the new repository as the development home; copy required ignored installation state separately and keep historical clones attached to the archive.
- [ ] Archive the historical repository read-only after verification; confirm its visibility is still private.

## Publication

- [ ] User confirms the exact reviewed publication snapshot and final visibility change.
- [ ] User changes the fresh repository's visibility to public; reconcile Terraform's `public_repository_visibility` with that setting.
- [ ] Enable and verify GitHub private vulnerability reporting.
- [ ] Verify an unauthenticated public clone and tracker pages; confirm the historical archive is inaccessible without authorization.
