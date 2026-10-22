# HCP Terraform control plane

This module manages the existing `harness` HCP Terraform workspace in the
control-plane organization. That workspace stores the repository's
infrastructure state. This module's own state belongs to the manually created
`platform-bootstrap` workspace in the same organization. It manages the
bootstrap workspace's project inventory variables, but not that workspace's
resource or settings.
See the [infrastructure workspace policy](../../docs/agents/infrastructure.md).

The control-plane organization remains an existing HCP administrative resource.
Project organizations declared through private `hcp_organization` metadata
are created by Terraform. Their required admin contact emails are sensitive
inputs. Terraform manages `project_organization_admin_emails` as a sensitive
HCL variable in the protected `platform-bootstrap` workspace, keyed by
organization name.
Do not put contact emails in project metadata. Terraform state may contain
organization contact details, so keep state in the protected remote backend.

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

`project_workspace_names` manages additional repository workspaces in the
control-plane state. Its empty default creates none. Set `hcp_workspace` on
each registered Terraform project in merged harness configuration. Optionally
set private `hcp_organization` as directed by the
[infrastructure organization policy](../../docs/agents/infrastructure.md#state-and-execution).
Projects without that field stay in the control-plane organization. Then run
`pnpm hcp:projects plan` and `pnpm hcp:projects apply` from the harness root.
The command supplies the complete workspace and organization inventory for that
run. The `tfe_variable` resources persist it in the `platform-bootstrap`
workspace for later remote runs, keeping private project and organization names
out of tracked files and public issue/plan summaries.
Set the existing `TF_VAR_tfe_organization` in the local environment and
use an HCP account with plan/apply access. The TFE provider token must be a user
token for an account with organization-creation rights and the required
workspace permissions in every selected organization. An
[organization-scoped token](https://developer.hashicorp.com/terraform/cloud-docs/users-teams-organizations/api-tokens)
is insufficient for cross-organization work. Store the token as the
`platform-bootstrap` workspace's sensitive `TFE_TOKEN` environment variable.
`plan` makes no changes;
`apply` shows its plan and prompts for approval.
The command writes an ignored `onboarding.auto.tfvars` file with mode `0600`
for the remote run and removes it afterward. If the command is interrupted and
the file remains, inspect and remove it before retrying; the next run refuses
to overwrite it. Use `--config-root <path>` when the private project overlay is
in another harness checkout.
Use organization isolation only as allowed by the
[infrastructure organization policy](../../docs/agents/infrastructure.md#state-and-execution).
It does not change the one-workspace-per-repository default.
The existing `tfe_workspace.harness` address remains unchanged; project names
cannot collide with it or `platform-bootstrap`.

Keep every managed name in the merged configuration after apply. The onboarding
command refuses an empty list, and `prevent_destroy` blocks accidental workspace
removal. Removing a name or renaming a
workspace is a migration, not routine cleanup. Do not remove the resource blocks
to bypass that protection. Keep state version recovery available and review any
removal, rename, or state operation explicitly.

The first managed run creates the project inventory HCP variables. If any
already exist, import them into `tfe_variable.project_workspace_names`,
`tfe_variable.project_workspace_organizations`, or
`tfe_variable.project_organization_names` before applying. A project
organization or workspace created outside this control plane also needs to be
imported into its corresponding resource address before apply. Configure
`project_organization_admin_emails` through the protected input workflow below
before planning any new organization. Its keys must cover every organization
being created.

### Protected organization contacts

For the first run or a contact rotation, supply the complete contact map as JSON
in `TF_VAR_project_organization_admin_emails` through protected process inputs or
the ignored harness-root `.env`. Load it with `node --env-file=.env --import tsx
scripts/hcp-projects.ts plan` (and then `apply` after plan approval); ordinary
`pnpm hcp:projects` does not load `.env` automatically. Keep actual contact
values out of commands, tracked files, and public logs.

Onboarding validates the input without echoing it and includes it in the
mode-`0600` temporary tfvars uploaded to the protected remote run. Terraform
persists the map through `tfe_variable.project_organization_admin_emails` with
`sensitive = true` and `hcl = true`. A plan alone does not persist it. After a
successful apply, unset the local override or remove it from `.env`; later runs
omit that input and use the protected workspace value. Leaving an old local
override present would supersede later rotations.

Import an existing workspace variable before the first apply, using the local
credentials and complete input prerequisites below. Supply its ID through a
private shell variable:

```sh
terraform import tfe_variable.project_organization_admin_emails "$TF_VAR_tfe_organization/platform-bootstrap/$CONTACT_VARIABLE_ID"
```

`prevent_destroy` protects the variable. Its value also exists in the protected
remote state and uploaded run configuration; HCP's sensitive flag redacts it
from plan output and prevents later API reads of its value. The provider cannot
detect an out-of-band change to a sensitive value. Rotate through Terraform
with a new complete input map, and keep state and configuration access limited
to authorized administrators. Provider behavior is documented in the
[`tfe_variable` reference](https://registry.terraform.io/providers/hashicorp/tfe/0.81.0/docs/resources/variable).

### CLI import prerequisites

CLI import runs the provider locally, even with remote state. Supply a local
`TFE_TOKEN` user token from protected custody, with the same cross-organization
permissions described above. Workspace environment variables are not available
to this local provider process.

Before importing, load the complete intended inventory into local environment
variables `TF_VAR_project_workspace_names`,
`TF_VAR_project_workspace_organizations`, and
`TF_VAR_project_organization_names`, using JSON values derived from the same
merged project configuration used by onboarding. Load
`TF_VAR_project_organization_admin_emails` from protected custody as a JSON map,
and retain `TF_VAR_tfe_organization` for the existing control-plane organization.
Remote workspace variables alone do not supply these local import inputs.
Keep values inside the process environment; never print them or paste them into
shell command arguments, tracked files, or public logs. Unset the temporary
inventory, contact, and token variables when adoption is complete.

Initialize the remote backend as described under State and credentials. Keep
these local inputs present for each `terraform state list` and `terraform import`
command below. The onboarding CLI removes its temporary tfvars after each run,
so invoking it beforehand does not leave import inputs behind. An omitted
inventory leaves the default project resource maps empty and cannot import a
project instance.

For an existing project organization, inspect state before adoption. Import it
before planning so Terraform does not attempt to recreate it:

```sh
terraform import "tfe_organization.project[\"$PROJECT_ORGANIZATION_NAME\"]" "$PROJECT_ORGANIZATION_NAME"
```

For an existing project workspace, inspect state before adoption. Import both
its workspace and settings into the selected map key before planning. Set the
organization slug in a private shell variable for dedicated organizations; for
a workspace in the shared organization, set it from
`TF_VAR_tfe_organization`. Do not paste resolved identities into issues or
logs:

```sh
terraform import "tfe_workspace.project[\"$PROJECT_WORKSPACE_NAME\"]" "$PROJECT_ORGANIZATION_NAME/$PROJECT_WORKSPACE_NAME"
terraform import "tfe_workspace_settings.project[\"$PROJECT_WORKSPACE_NAME\"]" "$PROJECT_ORGANIZATION_NAME/$PROJECT_WORKSPACE_NAME"
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
Both project workspaces and organizations have `prevent_destroy`. Terraform's
[`expect_failures` test support](https://developer.hashicorp.com/terraform/language/tests)
matches custom-condition failures, while this lifecycle guard emits a core
diagnostic. A mock apply followed by a plan that removed the project inventory
produced Terraform's `Instance cannot be destroyed` error; the Terraform test
runner cannot treat that core diagnostic as an expected failure.
