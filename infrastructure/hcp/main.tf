resource "tfe_workspace" "harness" {
  name         = var.harness_workspace_name
  organization = var.tfe_organization
  description  = "Remote state for the active harness, private historical archive, and continuation backend."

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
