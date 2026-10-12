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
    condition     = length(tfe_workspace.project) == 0 && tfe_workspace.harness.name == "harness"
    error_message = "Empty project input must leave the existing harness workspace address unchanged."
  }
}

run "isolated_repository_workspaces" {
  command = plan
  variables {
    project_workspace_names = ["synthetic-project", "second-project"]
  }
  assert {
    condition     = tfe_workspace.project["synthetic-project"].name == "synthetic-project" && tfe_workspace_settings.project["synthetic-project"].execution_mode == "remote"
    error_message = "Repository infrastructure must use its own workspace with remote execution."
  }
  assert {
    condition     = tfe_variable.project_workspace_names.key == "project_workspace_names" && tfe_variable.project_workspace_names.hcl && tfe_variable.project_workspace_names.workspace_id == data.tfe_workspace.platform_bootstrap.id && jsondecode(tfe_variable.project_workspace_names.value) == ["second-project", "synthetic-project"]
    error_message = "The complete project list must persist in the bootstrap workspace after apply."
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
