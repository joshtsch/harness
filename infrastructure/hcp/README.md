# HCP Terraform control plane

This module manages the existing `harness` HCP Terraform workspace in an
existing organization. That workspace stores the repository's infrastructure
state. This module's own state belongs to the manually created
`platform-bootstrap` workspace; the bootstrap workspace does not manage itself.
See the [infrastructure workspace policy](../../docs/agents/infrastructure.md).

The organization identity and organization rename remain one-time HCP
administrative operations. The module does not store an owner email or other
organization-level PII.

## State and credentials

Use the existing `platform-bootstrap` workspace for remote state and locking.
The `hashicorp/tfe` provider reads `TFE_TOKEN` from the environment. Configure
that token as a sensitive environment variable in the `platform-bootstrap`
workspace. Never commit the token or a local state file.

Create a temporary backend configuration file outside the repository:

```sh
export TF_VAR_tfe_organization="$TFE_ORGANIZATION"
cd infrastructure/hcp
cat > /tmp/harness-platform-bootstrap.tfbackend <<EOF
organization = "$TF_VAR_tfe_organization"
workspaces {
  name = "platform-bootstrap"
}
EOF
terraform init -backend-config=/tmp/harness-platform-bootstrap.tfbackend
rm /tmp/harness-platform-bootstrap.tfbackend
```

## First adoption

The `platform-bootstrap` workspace is created manually. The `harness` workspace
already exists, so adopt it into the bootstrap workspace's remote state before
planning. Check the state first; only import resources that are absent from it.

```sh
terraform state list
terraform import tfe_workspace.harness "$TF_VAR_tfe_organization/harness"
terraform import tfe_workspace_settings.harness "$TF_VAR_tfe_organization/harness"
```

Both imports only record the existing resources in Terraform state. Then plan
and review any proposed changes to workspace metadata or execution mode:

```sh
terraform plan
```

Apply only after reviewing the plan:

```sh
terraform apply
```

`prevent_destroy` protects the managed workspace from accidental Terraform
removal.

## Repository workspaces

`project_workspace_names` manages additional repository workspaces in this same
control-plane state. Its empty default creates none. Supply the names through a
persistent Terraform variable in the `platform-bootstrap` workspace, keeping
private project names out of tracked files and public issue/plan summaries.
Use one workspace per repository unless another boundary is explicitly approved.
The existing `tfe_workspace.harness` address remains unchanged; project names
cannot collide with it or `platform-bootstrap`.

Populate the persistent input before planning, and keep every managed name in
it after apply. A one-run override is insufficient: a later empty input would
propose removal and fail `prevent_destroy`. Removing a name or renaming a
workspace is a migration, not routine cleanup. Do not remove the resource blocks
to bypass that protection. Keep state version recovery available and review any
removal, rename, or state operation explicitly.

For an existing project workspace, inspect state before adoption. Import both
its workspace and settings into the selected map key before planning. Use a
private temporary shell variable for the name; do not paste resolved identities
into issues or logs:

```sh
terraform import "tfe_workspace.project[\"$PROJECT_WORKSPACE_NAME\"]" "$TF_VAR_tfe_organization/$PROJECT_WORKSPACE_NAME"
terraform import "tfe_workspace_settings.project[\"$PROJECT_WORKSPACE_NAME\"]" "$TF_VAR_tfe_organization/$PROJECT_WORKSPACE_NAME"
```

New workspaces use remote execution. Configure provider credentials as sensitive
environment variables in the target workspace's protected store. Application
resources belong to the owning repository's Terraform root, not this control
plane. Existing resource adoption must not replace or destroy a workspace.

Validate the control-plane configuration without backend initialization or live
writes:

```sh
terraform init -backend=false -input=false
terraform fmt -check -recursive
terraform validate
terraform test
```

Mock-provider tests require Terraform 1.7 or newer. The resource configuration
retains its existing Terraform 1.6 minimum.

Mock plans prove empty-default behavior, repository isolation, remote execution,
and rejection of harness/bootstrap collisions and invalid names. Live planning
still requires the existing remote backend and control-plane credentials.
