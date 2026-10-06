# Harness repository infrastructure

This is the Terraform root for infrastructure owned by this repository. The
existing HCP Terraform workspace `harness` stores its encrypted remote state
and provides state locking. It manages the fresh GitHub repository, private historical archive, and
Harness continuation Supabase project together. Follow the
[infrastructure workspace policy](../docs/agents/infrastructure.md). Do not use
local state or commit backend files, plans, credentials, or database passwords.

The `infrastructure/hcp/` directory is a separate control-plane root managed by
the manually created `platform-bootstrap` workspace. It manages HCP workspaces
and is the documented bootstrap exception to the repository/workspace default.

## Initialize and plan

Use a temporary backend configuration outside the repository:

```sh
cat > /tmp/harness.tfbackend <<EOF
organization = "$TF_CLOUD_ORGANIZATION"
workspaces {
  name = "harness"
}
EOF
terraform -chdir=infrastructure init -backend-config=/tmp/harness.tfbackend
rm /tmp/harness.tfbackend
```

The existing `github_repository.harness` address retains the historical repository
identity. Its name becomes `harness-private-archive` and its visibility is fixed
to private. `github_repository.public_harness` creates the replacement named
`harness`; it depends on the rename so the name is available first. Both resources
prevent destruction. Inspect existing state before planning; never import a
resource that is already recorded or assign the historical state entry to the
fresh repository.

## Fresh repository cutover

Follow [ADR-0012](../docs/adr/0012-public-repository-hygiene.md) and the
[release checklist](../docs/public-release-checklist.md). Resolve open merge
requests, verify the encrypted rollback mirror and configuration backup, and
review the final source snapshot before applying.

Retarget the historical clone to `git@github.com:joshtsch/harness-private-archive.git`
before creating the fresh repository. All worktrees sharing its Git configuration
inherit that remote. Reusing `harness` disables GitHub rename redirects, so old
clone URLs and issue links must be updated explicitly.

The first plan must rename the existing repository while keeping it private and
unarchived, create the fresh repository privately, and leave the continuation
backend unchanged. `public_repository_visibility` defaults to `private`.
Do not apply a plan that publishes the historical repository, destroys a
resource, or changes the continuation backend.

After pushing and verifying one audited initial commit on the fresh repository's
`main`, set the HCP Terraform variable `archive_private_repository` to `true`,
review the archive-only plan, and apply it. Archival makes historical code and
tracker records read-only. The final visibility change remains user-controlled;
after publication, set `public_repository_visibility` to `public` in the same
workspace and verify that the plan has no drift. Persist these settings in HCP;
do not rely on a one-run override that a later default plan would undo.

Create the active development clone with fresh Git metadata. Move required ignored
installation state separately; never repoint the historical clone at the fresh
repository. Keep the same HCP workspace for both GitHub identities and the
continuation backend. The `platform-bootstrap` control plane stays separate.

Configure these HCP workspace variables without putting their values in Git:

| Name | HCP variable type | Sensitivity |
| --- | --- | --- |
| `GITHUB_TOKEN` | Environment | Sensitive |
| `SUPABASE_ACCESS_TOKEN` | Environment | Sensitive |
| `organization_id` | Terraform | Non-sensitive |
| `database_password` | Terraform | Sensitive |

Terraform uses `database_password` when creating the project, but the Supabase
provider cannot read it back or update it. The resource therefore ignores
password changes after creation, including when importing an existing project.
Manage any later password rotation through Supabase's supported workflow and
update dependent secret stores separately.

The Supabase project defaults to `harness-continuation` in Canada Central
(`ca-central-1`). Keep paid add-ons disabled. Before initial creation, review a
fresh plan: the existing GitHub resource must remain unchanged, and project
creation must be the only proposed action. Import existing projects before
Terraform manages them; an import-only recovery plan must not create, update,
or destroy the Supabase project. Apply only the reviewed, in-scope plan.

The Supabase Terraform provider is Public Alpha. Project deletion is protected
with `prevent_destroy`. After creation, store the project URL and service-role
key in Bitwarden and provide them to the harness as
`HARNESS_CONTINUATION_SUPABASE_URL` and
`HARNESS_CONTINUATION_SUPABASE_SERVICE_ROLE_KEY`. Never expose or commit the
service-role key.
