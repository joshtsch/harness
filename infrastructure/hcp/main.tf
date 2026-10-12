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
  organization = var.tfe_organization
  description  = "Repository infrastructure state managed by the shared control plane."

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = each.value != var.harness_workspace_name && each.value != "platform-bootstrap"
      error_message = "Project workspaces cannot reuse the harness or control-plane workspace."
    }
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
