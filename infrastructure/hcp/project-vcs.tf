resource "tfe_variable" "project_workspace_vcs" {
  workspace_id = data.tfe_workspace.platform_bootstrap.id
  key          = "project_workspace_vcs"
  value        = replace(replace(jsonencode(var.project_workspace_vcs), "$${", "$$${"), "%%{", "%%%{")
  category     = "terraform"
  hcl          = true
  sensitive    = true
  description  = "Complete private project VCS connection inventory managed by onboarding."

  lifecycle {
    prevent_destroy = true
  }
}
