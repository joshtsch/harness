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
