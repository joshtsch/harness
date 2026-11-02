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
For provider authentication, use the [protected user-token input](#protected-provider-authentication)
below. Existing installations without that input retain the provider's
`TFE_TOKEN` environment or CLI credential fallback. Never commit the token or
a local state file.

The `cloud` integration uses the existing organization from
`TF_CLOUD_ORGANIZATION` and pins the workspace to `platform-bootstrap`.
Onboarding derives that organization from `TF_VAR_tfe_organization`. For manual
initialization, first confirm that this organization already contains the
intended workspace, then run:

```sh
export TF_CLOUD_ORGANIZATION="$TF_VAR_tfe_organization"
unset TF_WORKSPACE
cd infrastructure/hcp
terraform init -input=false
```

### Existing remote-backend installations

Replacing the legacy `remote` backend with `cloud` retains the same HCP
organization, workspace, state, and locking. Before initialization, record the
existing workspace ID and state lineage/serial privately; verify they are
unchanged afterward. Run `terraform init` once with interactive input to approve
this same-workspace connection migration; unattended `-input=false` runs cannot
approve that first transition. Later onboarding runs initialize noninteractively.
Stop if initialization selects a different workspace or
requests creation of a new one. No state push, move, or resource import is
needed for this connection change. See HashiCorp's
[remote-backend migration guide](https://developer.hashicorp.com/terraform/cli/cloud/settings#migrate-remote-backend).

To roll back the connection, restore the previous `backend "remote"` block and
initialize it with the same private organization and `platform-bootstrap`
workspace settings. Resource state remains in that workspace. The legacy
backend cannot accept explicit run variables, so inventory updates require the
cloud path described here.

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
is insufficient for cross-organization work. Store the token in the
`platform-bootstrap` workspace through the protected input workflow below.
`plan` makes no changes;
`apply` shows its plan and prompts for approval.
The command writes an ignored `onboarding.auto.tfvars` file with mode `0600`
and passes it explicitly with `-var-file` to both plan and apply. HCP's saved
workspace variables override automatically loaded tfvars files; explicit run
inputs override those saved values, making the current merged inventory
authoritative. See [HCP variable precedence](https://developer.hashicorp.com/terraform/cloud-docs/variables#precedence).
The file is removed afterward. If the command is interrupted and
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

### Protected provider authentication

CLI authentication and the remote provider credential are separate. A local
login can start a remote run while that run's workspace credential lacks
organization-creation permissions. Only user tokens can create organizations;
use a user token with access to every organization managed by this control plane.

For the first run or token rotation, supply `TFE_TOKEN` from protected custody
through the local process environment or ignored `.env`. Load it with
`node --env-file=.env --import tsx scripts/hcp-projects.ts plan`, then run
`apply` after reviewing the plan. Onboarding places it in the private temporary
tfvars as the sensitive `tfe_provider_token` input. The remote provider uses
that input immediately, and `tfe_variable.provider_token[0]` persists it as a
sensitive Terraform workspace variable for later runs. Without a configured
input, the provider retains its environment/CLI authentication fallback and no
token variable resource is created.

After a successful apply, remove the local `TFE_TOKEN` override so subsequent
runs use the protected workspace input. A stale local token would supersede a
later rotation. The pre-existing remote `TFE_TOKEN` environment variable is
outside this resource's ownership; an explicit `tfe_provider_token` takes
precedence. Removing the protected input later is a credential migration:
`prevent_destroy` guards its resource.

The token exists in uploaded configuration and protected Terraform state as
well as the workspace variable. Restrict those surfaces to authorized
administrators, never print the token, and rotate it through protected inputs.
HCP masks sensitive variables, so Terraform cannot detect a value changed
outside Terraform. If `tfe_provider_token` already exists in HCP, import it
before applying, using the CLI import prerequisites below and locally supplied
`TF_VAR_tfe_provider_token` from protected custody:

```sh
terraform import 'tfe_variable.provider_token[0]' "$TF_VAR_tfe_organization/platform-bootstrap/$PROVIDER_TOKEN_VARIABLE_ID"
```

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

### Automatic infrastructure PR plans

Project workspace VCS settings are owned by this control plane. Supply the
complete private `TF_VAR_project_workspace_vcs` JSON map through protected
process inputs or the ignored harness-root `.env`:

```json
{
  "example-infrastructure": {
    "identifier": "example-owner/example-repository",
    "branch": "main",
    "working_directory": "infrastructure",
    "github_app_installation_id": "ghain-EXAMPLE"
  }
}
```

Workspace names must be registered. `identifier` is the GitHub owner/repository;
the installation ID is HCP's `ghain-` identifier, not GitHub's numeric installation
ID. The working directory must be a nonempty repository-relative directory with
no `.` or `..` segments. Root-directory configurations are outside this interface.

As checked on 22 October 2026, connecting through the GitHub App requires two existing
permissions: the HCP token's user must have authorized the Terraform Cloud GitHub
App, and the app installation must have access to the repository. Neither the API
nor the provider can initiate the user's browser authorization. In HCP's
workspace Settings → Version Control, choose GitHub.com and complete the GitHub
authorization. If necessary, install or configure the app for the intended
repository. Stop before saving the workspace connection: Terraform owns that
setting. See HashiCorp's [GitHub App setup guide](https://developer.hashicorp.com/terraform/cloud-docs/vcs/github-app#authorizing).

After authorization, inspect the [GitHub App installations API](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/github-app-installations)
with the existing protected user token and select the matching accessible
installation. Keep its ID and repository identity private. Installing or
authorizing the app is a browser prerequisite; it does not justify changing
Terraform-supported workspace settings through another transport.

Run onboarding `plan`, review the complete changes, and apply within the approved
scope. The workspace uses the selected base branch and working directory, with
file triggers restricted to `<working_directory>/**`. Speculative plans are
enabled and auto-apply is explicitly disabled. HCP reports PR plans to GitHub;
merges to the configured branch can queue an ordinary plan that still requires
apply approval. Existing GitHub Actions formatting, validation, and mock-provider
checks remain useful alongside these real plans.

PR Terraform code runs with workspace credentials. Enable this workflow only for
repositories whose PR authors and reviewers are trusted with those credentials;
review fork and collaborator access before connection. Sensitive variable flags
do not prevent malicious Terraform code from reading environment credentials.
Keep apply permissions restricted separately.

The complete connection map persists as a sensitive bootstrap variable through
`tfe_variable.project_workspace_vcs`; template markers are escaped for HCL reuse.
Remove the local override after a successful apply. Later connection changes
must supply the complete inventory so unrelated connections are preserved.
Omitting an entry disconnects that workspace and restores its default working
directory; review the plan before doing so. Import an existing bootstrap variable
before adoption, using the same prerequisites as protected project inputs.
Application workspaces already managed by the control plane keep their IDs and
state. Inspect an existing connection before replacing it; do not reconnect a
repository under a different workspace to bypass adoption.

To verify activation, inspect live VCS settings, directory triggers, speculative
enablement, and disabled auto-apply. Then confirm an infrastructure PR produces
an HCP speculative plan and a GitHub status on its current commit. A saved
connection or a manually queued plan alone does not prove PR triggering. Report
authorization or missing-event blockers explicitly. This configuration does not
make the HCP status a required GitHub branch-protection check.

### Protected project inputs

The control plane manages provider credentials and literal Terraform inputs for
registered project workspaces with `tfe_variable.project_input`. Supply the
complete inventory as JSON in `TF_VAR_project_workspace_variables`, through a
protected process environment or the ignored harness-root `.env`:

```json
{
  "example-infrastructure": {
    "environment": { "EXAMPLE_PROVIDER_TOKEN": "<from protected custody>" },
    "terraform": { "region": "example-region" }
  }
}
```

Workspace names must match the merged registered inventory. Variable names must
be identifiers and values must be strings. The two categories are `environment`
and `terraform`; omitted categories are empty. Each individual value is a literal
string (`hcl = false`) and sensitive, including private account metadata.
Arbitrary HCL expressions are outside this interface.

Load the private environment and run onboarding as described for organization
contacts. The CLI validates the map without echoing it, escapes HCL template
markers in temporary input, and removes its mode-`0600` tfvars after the run.
Inspect existing variables and attached variable sets before applying; import
existing workspace variables instead of creating duplicates. Do not override
inherited provider credentials without reviewing their ownership and precedence.
An individual variable address is the JSON-encoded tuple
`[workspace, category, key]`, where category is `environment` or `terraform`:

```sh
terraform import 'tfe_variable.project_input["[\"example-infrastructure\",\"environment\",\"EXAMPLE_PROVIDER_TOKEN\"]"]' "$PROJECT_ORGANIZATION_NAME/$PROJECT_WORKSPACE_NAME/$PROJECT_VARIABLE_ID"
```

Use the local import prerequisites below, plus the complete protected project
input map, when adopting existing variables. If the bootstrap aggregate already
exists, import `tfe_variable.project_workspace_variables` with the bootstrap
organization/workspace/variable ID before applying.

After reviewing and applying the plan, Terraform persists the complete inventory
as the sensitive HCL variable `project_workspace_variables` in `platform-bootstrap`.
Template markers are escaped in this persisted aggregate as well. Remove the
local override after successful persistence so subsequent runs use that protected
input. For rotations, supply a new complete map including unchanged inputs for
all managed workspaces. Omitting an existing managed input is blocked by
`prevent_destroy`; intentional removal requires a separately reviewed lifecycle
change. Changing a variable's category or key also changes its address.

Values exist in encrypted remote state and uploaded run configuration, as well as
the destination workspace. Sensitive flags redact values from routine output;
they do not eliminate those stored copies. Restrict bootstrap state and run
access accordingly. The provider cannot detect out-of-band edits to sensitive
values; rotate through Terraform. Keep application inputs out of public project
configuration and issues. This step configures execution inputs only; it does
not provision application resources or release an application.

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

New workspaces use remote execution. Configure provider credentials through the
[protected project inputs](#protected-project-inputs) workflow. Application
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
