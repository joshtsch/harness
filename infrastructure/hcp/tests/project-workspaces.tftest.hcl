mock_provider "tfe" {}

override_data {
  target = data.tfe_workspace.platform_bootstrap
  values = { id = "ws-1234567890123456" }
}

variables {
  tfe_organization = "synthetic-organization"
}

run "empty_default_preserves_control_plane" {
  command = plan
  assert {
    condition     = length(tfe_workspace.project) == 0 && tfe_workspace.harness.name == "harness" && length(tfe_variable.provider_token) == 0
    error_message = "Empty project input must leave the existing harness workspace address unchanged."
  }
}

run "protected_provider_token" {
  command = plan
  variables {
    tfe_provider_token = join("-", ["synthetic", "credential"])
  }
  assert {
    condition     = length(tfe_variable.provider_token) == 1 && tfe_variable.provider_token[0].sensitive && tfe_variable.provider_token[0].category == "terraform" && tfe_variable.provider_token[0].key == "tfe_provider_token" && tfe_variable.provider_token[0].value == var.tfe_provider_token && tfe_variable.provider_token[0].workspace_id == data.tfe_workspace.platform_bootstrap.id
    error_message = "A supplied provider credential must persist as a sensitive bootstrap input."
  }
}

run "reject_empty_provider_token" {
  command = plan
  variables {
    tfe_provider_token = " "
  }
  expect_failures = [var.tfe_provider_token]
}

run "isolated_repository_workspaces" {
  command = plan
  variables {
    project_workspace_names = ["synthetic-project", "second-project"]
  }
  assert {
    condition     = tfe_workspace.project["synthetic-project"].name == "synthetic-project" && tfe_workspace.project["synthetic-project"].organization == "synthetic-organization" && tfe_workspace_settings.project["synthetic-project"].execution_mode == "remote"
    error_message = "Repository infrastructure must use its own workspace with remote execution."
  }
  assert {
    condition     = tfe_variable.project_workspace_names.key == "project_workspace_names" && tfe_variable.project_workspace_names.hcl && tfe_variable.project_workspace_names.workspace_id == data.tfe_workspace.platform_bootstrap.id && jsondecode(tfe_variable.project_workspace_names.value) == ["second-project", "synthetic-project"]
    error_message = "The complete project list must persist in the bootstrap workspace after apply."
  }
}

run "dedicated_organizations" {
  command = plan
  variables {
    project_workspace_names           = ["finance-state", "tax-state"]
    project_workspace_organizations   = { "finance-state" = "finance-org", "tax-state" = "tax-org" }
    project_organization_names        = ["finance-org", "tax-org"]
    project_organization_admin_emails = { "finance-org" = "finance@example.invalid", "tax-org" = "tax@example.invalid" }
  }
  assert {
    condition     = tfe_organization.project["finance-org"].name == "finance-org" && tfe_organization.project["tax-org"].name == "tax-org"
    error_message = "Each explicitly configured project organization must be managed."
  }
  assert {
    condition     = tfe_workspace.project["finance-state"].organization == "finance-org" && tfe_workspace.project["tax-state"].organization == "tax-org"
    error_message = "Each project workspace must use its configured organization."
  }
  assert {
    condition     = tfe_variable.project_organization_admin_emails.sensitive && tfe_variable.project_organization_admin_emails.hcl && tfe_variable.project_organization_admin_emails.category == "terraform" && tfe_variable.project_organization_admin_emails.workspace_id == data.tfe_workspace.platform_bootstrap.id && tfe_variable.project_organization_admin_emails.value == jsonencode(var.project_organization_admin_emails)
    error_message = "Organization contacts must persist as a protected HCL input in the bootstrap workspace."
  }
}


run "reject_harness_collision" {
  command = plan
  variables {
    harness_workspace_name  = "custom-harness"
    project_workspace_names = ["custom-harness"]
  }
  expect_failures = [tfe_workspace.project]
}

run "reject_bootstrap_collision" {
  command = plan
  variables {
    project_workspace_names = ["platform-bootstrap"]
  }
  expect_failures = [tfe_workspace.project]
}

run "reject_invalid_workspace_name" {
  command = plan
  variables {
    project_workspace_names = ["invalid/name"]
  }
  expect_failures = [var.project_workspace_names]
}

run "reject_unmanaged_organization_mapping" {
  command = plan
  variables {
    project_workspace_names         = ["finance-state"]
    project_workspace_organizations = { "finance-state" = "missing-org" }
  }
  expect_failures = [data.tfe_workspace.platform_bootstrap]
}

run "reject_unknown_workspace_mapping" {
  command = plan
  variables {
    project_workspace_organizations   = { "missing-state" = "finance-org" }
    project_organization_names        = ["finance-org"]
    project_organization_admin_emails = { "finance-org" = format("%s@%s", "finance", "example.invalid") }
  }
  expect_failures = [data.tfe_workspace.platform_bootstrap]
}

run "reject_control_plane_organization" {
  command = plan
  variables {
    project_organization_names        = ["synthetic-organization"]
    project_organization_admin_emails = { "synthetic-organization" = format("%s@%s", "admin", "example.invalid") }
  }
  expect_failures = [data.tfe_workspace.platform_bootstrap]
}
