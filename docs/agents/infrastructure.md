# Infrastructure Management

Use Terraform as the default control plane for declarative infrastructure
changes whenever a maintained provider and resource can represent the target.
This applies to hosting projects, deployment protection, domains, environment
configuration, storage, databases, networking, and similar durable resources.

Before changing shared infrastructure:

- identify the Terraform provider/resource and import existing resources before
  managing them;
- use a remote backend with encryption, versioning or recovery, and state
  locking; never commit state, provider credentials, or resolved backend secrets;
- map each repository's infrastructure to one HCP Terraform workspace and state
  by default; don't create a workspace for every infrastructure directory;
- create additional workspaces only with written approval for a documented
  security, lifecycle, or other operational boundary (for example, blast-radius
  isolation) that cannot be met within one workspace; record the reason and
  backend/workspace identity without credentials;
- run formatting, validation, and a plan, then apply only within the user's
  authorized scope;

The shared `platform-bootstrap` workspace is a control-plane exception: it
manages HCP Terraform workspaces themselves and is not a repository's
infrastructure workspace.

Terraform is not mandatory when provider coverage is absent, the provider cannot
represent the required setting safely, or the change is a one-time recovery
operation. In those cases, use the narrowest supported API, CLI, or dashboard
fallback, record the reason and resulting resource state in the issue or
session scratch metadata, and leave a follow-up path for bringing the resource
under Terraform management.

Manual changes must not silently become the durable workflow when Terraform can
manage the same resource. Reconcile any manual change back into Terraform
configuration and state before reporting the infrastructure task complete.
