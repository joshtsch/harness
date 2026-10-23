locals {
  # Declassify only addresses; variable values remain sensitive.
  project_variable_addresses = nonsensitive(toset(flatten([
    for workspace, categories in var.project_workspace_variables : [
      for category, variables in categories : [
        for key, value in variables : jsonencode([workspace, category, key])
      ]
    ]
  ])))
}

resource "tfe_variable" "project_input" {
  for_each     = local.project_variable_addresses
  workspace_id = tfe_workspace.project[jsondecode(each.key)[0]].id
  key          = jsondecode(each.key)[2]
  category     = jsondecode(each.key)[1] == "environment" ? "env" : "terraform"
  value        = var.project_workspace_variables[jsondecode(each.key)[0]][jsondecode(each.key)[1]][jsondecode(each.key)[2]]
  hcl          = false
  sensitive    = true
  description  = "Protected repository input managed by project onboarding."

  lifecycle {
    prevent_destroy = true
  }
}

resource "tfe_variable" "project_workspace_variables" {
  workspace_id = data.tfe_workspace.platform_bootstrap.id
  key          = "project_workspace_variables"
  value        = replace(replace(jsonencode(var.project_workspace_variables), "$${", "$$${"), "%%{", "%%%{")
  category     = "terraform"
  hcl          = true
  sensitive    = true
  description  = "Complete protected project input inventory managed by onboarding."

  lifecycle {
    prevent_destroy = true
  }
}
