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

### Shared GitHub Actions secret fan-out

Checked 11 October 2026 against `integrations/github` provider 6.13.0. The maintained
provider supports repository Actions secrets through
[`github_actions_secret`](https://registry.terraform.io/providers/integrations/github/6.13.0/docs/resources/actions_secret).
Its sensitive value still resides in Terraform state, which must be treated as
sensitive. The provider therefore covers per-repository secret management, but
it does not provide one shared secret scope for personal-account repositories.

The user chose the harness Terraform root to manage shared Actions secret values
across configured project repositories. See the [shared Actions secrets guide](../../infrastructure/README.md#shared-actions-secrets).
The remote HCP workspace cannot read ignored `projects.local.yml`, so its
private `github_project_repositories` variable must stay aligned with the
configured GitHub projects during onboarding. Shared secret values are supplied
through the sensitive `shared_actions_secrets` workspace variable. Terraform
state contains the values and must remain encrypted and access-controlled.
PR changes to the infrastructure root run a plan-only workflow against this
workspace; see the [Terraform plan pipeline](../../.github/workflows/terraform-plan.yml).

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

## Unsupported operations and recovery

A fallback may be needed when no maintained provider covers an operation,
when a provider cannot represent the required setting safely, or for a
one-time recovery operation that Terraform cannot perform safely. Complete the
coverage gate even for recovery; one unsupported step does not exempt the rest
of a workflow.

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
