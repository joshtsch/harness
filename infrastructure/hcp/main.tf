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
