resource "tfe_workspace" "harness" {
  name         = var.harness_workspace_name
  organization = var.tfe_organization
  description  = "Remote state and Terraform runs for joshtsch/harness."

  lifecycle {
    prevent_destroy = true
  }
}

resource "tfe_workspace_settings" "harness" {
  workspace_id   = tfe_workspace.harness.id
  execution_mode = "remote"
}

resource "tfe_workspace" "project" {
  for_each     = var.project_workspace_names
  name         = each.value
  organization = lookup(var.project_workspace_organizations, each.key, var.tfe_organization)
  description  = "Repository infrastructure state managed by the shared control plane."
  depends_on   = [tfe_organization.project]

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = each.value != var.harness_workspace_name && each.value != "platform-bootstrap"
      error_message = "Project workspaces cannot reuse the harness or control-plane workspace."
    }
  }
}

resource "tfe_organization" "project" {
  for_each = var.project_organization_names
  name     = each.value
  email    = var.project_organization_admin_emails[each.key]

  lifecycle {
    prevent_destroy = true
  }
}

resource "tfe_workspace_settings" "project" {
  for_each       = var.project_workspace_names
  workspace_id   = tfe_workspace.project[each.key].id
  execution_mode = "remote"
}

data "tfe_workspace" "platform_bootstrap" {
  name         = "platform-bootstrap"
  organization = var.tfe_organization

  # Cross-input checks use preconditions to support Terraform 1.6.
  lifecycle {
    precondition {
      condition     = alltrue([for workspace, organization in var.project_workspace_organizations : contains(var.project_workspace_names, workspace) && contains(var.project_organization_names, organization)])
      error_message = "Dedicated organization mappings must reference configured project workspaces and managed project organizations."
    }
    precondition {
      condition     = !contains(var.project_organization_names, var.tfe_organization)
      error_message = "Project organizations must be distinct from the existing control-plane organization."
    }
  }
}

# Persist run-specific onboarding input for later remote plans.
resource "tfe_variable" "project_workspace_names" {
  workspace_id = data.tfe_workspace.platform_bootstrap.id
  key          = "project_workspace_names"
  value        = jsonencode(sort(tolist(var.project_workspace_names)))
  category     = "terraform"
  hcl          = true
  description  = "HCP workspaces for registered Terraform projects. Managed by project onboarding."

  lifecycle {
    prevent_destroy = true
  }
}

resource "tfe_variable" "project_workspace_organizations" {
  workspace_id = data.tfe_workspace.platform_bootstrap.id
  key          = "project_workspace_organizations"
  value        = jsonencode(var.project_workspace_organizations)
  category     = "terraform"
  hcl          = true
  description  = "Project workspace to dedicated HCP organization mapping. Managed by project onboarding."
}

resource "tfe_variable" "project_organization_names" {
  workspace_id = data.tfe_workspace.platform_bootstrap.id
  key          = "project_organization_names"
  value        = jsonencode(sort(tolist(var.project_organization_names)))
  category     = "terraform"
  hcl          = true
  description  = "HCP organizations managed for registered projects. Managed by project onboarding."
}
