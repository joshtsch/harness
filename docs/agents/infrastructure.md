# Infrastructure management

Terraform is the first choice for infrastructure changes whenever a maintained
provider and resource can represent the operation. This includes organizations,
hosting projects, deployment protection, domains, environment configuration,
storage, databases, networking, and similar durable resources. Apply this
policy before choosing MCP, API, CLI, or dashboard writes, including writes
suggested by a plugin or skill. Read-only inspection may use those tools.

Creating a GitHub repository is project intake, not infrastructure provisioning.
Use `gh repo create` after registering and validating the project; apply this
Terraform policy to separate infrastructure resources the project needs.
See [repository intake](repository-intake.md#prepare-the-repository).

## Terraform coverage gate

Complete these steps before selecting an infrastructure write tool:

1. Identify the owning repository, account, existing resources, and authorized
   changes. Break the work into operations; coverage for a project does not
   establish coverage for its organization or every setting.
2. Inspect existing Terraform configuration and state ownership. Verify each
   operation against current official documentation or source for a maintained
   provider. Record the provider, version, resource or setting, source, check
   date, and coverage conclusion in the issue or ignored session notes. Redact
   account context and follow [Secrets and PII safety](data-safety.md).
3. For supported operations, prepare Terraform configuration in the owning
   repository. Import existing resources before managing them. Follow the
   state and execution requirements below before any apply.
4. For an unsupported operation, document the specific coverage gap and prepare
   the scoped fallback described below. Keep supported operations in Terraform.
   When coverage is uncertain, continue read-only investigation; do not write
   through another tool until the gap is established.

Missing credentials, local Terraform tooling, backend access, or a connector
operation are access or setup blockers, not evidence of missing provider
coverage. Resolve them through the authorized setup workflow or report the
blocker. Do not use a browser or another transport to bypass denied access.

## State and execution

Before changing shared infrastructure:

- use a remote backend with encryption, versioning or recovery, and state
  locking; never commit state, provider credentials, or resolved backend secrets;
- map each repository's infrastructure to one HCP Terraform workspace and state
  by default; don't create a workspace for every infrastructure directory;
- create additional workspaces only with written approval for a documented
  security, lifecycle, or other operational boundary (for example, blast-radius
  isolation) that cannot be met within one workspace; record the reason and
  backend/workspace identity without credentials;
- run formatting, validation, and a plan, then apply only within the user's
  authorized scope.

The shared `platform-bootstrap` workspace is a control-plane exception: it
manages HCP Terraform workspaces themselves and is not a repository's
infrastructure workspace. Follow its
[repository workspace inputs and adoption guide](../../infrastructure/hcp/README.md#repository-workspaces)
when preparing state ownership for a registered project.

Checked 21 October 2026 against maintained `hashicorp/tfe` provider 0.81.0:
`tfe_workspace`, `tfe_workspace_settings`, and
[`tfe_variable`](https://registry.terraform.io/providers/hashicorp/tfe/0.81.0/docs/resources/variable)
cover project workspace creation, remote execution, and persistence of the
bootstrap inputs. The pinned `hashicorp/tfe` provider also has a
[`tfe_organization` resource](https://registry.terraform.io/providers/hashicorp/tfe/0.81.0/docs/resources/organization)
for creating project organizations. Onboarding supplies the complete workspace
and organization inventory from merged private project configuration through a
CLI-driven HCP run. An organization-specific administrative contact email is
provided as a protected bootstrap variable. Cross-organization management
requires a user token whose account has the necessary permissions in each
organization; [organization tokens are scoped to their organization](https://developer.hashicorp.com/terraform/cloud-docs/users-teams-organizations/api-tokens)
and cannot manage other organizations.

## Unsupported operations and recovery

A fallback may be needed when no maintained provider covers an operation,
when a provider cannot represent the required setting safely, or for a
one-time recovery operation that Terraform cannot perform safely. Complete
the coverage gate even for recovery;
one unsupported step does not exempt the rest of a workflow.

Before a fallback write:

1. Record the coverage evidence or recovery reason, exact operation, affected
   scope, proposed API, CLI, MCP, or dashboard action, expected result, and
   recovery or reconciliation plan. Choose the narrowest supported action.
2. Check whether the user has already explicitly authorized that exact fallback
   and scope. If so, proceed without asking again. Otherwise, present the
   prepared action and reason Terraform cannot perform it safely, and obtain an
   explicit fallback decision before executing. General permission to provision
   infrastructure does not by itself select a non-Terraform fallback.
3. After execution, verify the resulting resource state and record a redacted
   summary. For an uncertain write result, inspect state before retrying.

Reconcile any manual change Terraform can manage into configuration and state
before reporting the infrastructure task complete. For a resource that remains
unsupported, document ownership, the ongoing management path, and a follow-up
condition for importing it if provider support becomes available. Keep secrets,
raw responses, and private account details out of issues and session notes.

### Supabase organizations

As of 21 October 2026, the Supabase Terraform provider manages projects and
project-level resources, but has no organization resource. Keep project
infrastructure in Terraform and use the Supabase CLI only for organization
operations the provider cannot manage. Recheck the
[provider resource reference](https://supabase.com/docs/guides/deployment/terraform/reference)
before relying on this gap; provider coverage can change. If the provider adds
organization support, assess importing existing organizations into Terraform
and move their ongoing management there when safe.

Treat a Supabase organization as a billing and membership boundary. Put projects
in the same organization when they share ownership, access, and billing; create
another organization when one of those boundaries needs separation. A project
or environment does not need its own organization by default. Each Supabase
project is an independent instance; environments that need isolation should
generally use separate projects in the same org.

To inspect available organizations, authenticate as a member of the intended
Supabase account, then run:

```sh
supabase login
supabase orgs list
```

`supabase login` prompts for a personal access token and stores it in native
credentials storage when available. Otherwise, the CLI writes it to
`~/.supabase/access-token`; protect that local file. Do not pass the token as a
command-line argument or save it in the repository. See the
[CLI login reference](https://supabase.com/docs/reference/cli/supabase-login)
for token storage details.

To create an organization, first confirm the intended owner/account, name,
membership, and billing boundary. Check `supabase orgs create --help` against the
installed CLI version, then run `supabase orgs create` and complete its prompts.
This creates an organization for the signed-in user; manage its members through
the Supabase dashboard. Before using this write,
follow the [unsupported-operation fallback procedure](#unsupported-operations-and-recovery)
and obtain explicit authorization for the specific organization. Do not put
access tokens or private account details in issues or session notes.

Use the organization ID or slug shown by the CLI when configuring a
`supabase_project` resource. The CLI commands are documented in the
[Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-orgs).
