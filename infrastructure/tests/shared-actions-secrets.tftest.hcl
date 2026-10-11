mock_provider "github" {}
mock_provider "supabase" {}

variables {
  organization_id   = "synthetic-organization"
  database_password = "fake"
}

run "one_shared_value_targets_each_repository" {
  command = plan

  variables {
    github_project_repositories = [
      "joshtsch/project-one",
      "joshtsch/project-two",
    ]
    shared_actions_secrets = {
      SHARED = "synthetic-value"
    }
  }

  assert {
    condition     = length(github_actions_secret.shared) == 2
    error_message = "Terraform must create one shared secret resource per configured repository."
  }

  assert {
    condition     = github_actions_secret.shared["joshtsch/project-one/SHARED"].repository == "project-one"
    error_message = "The secret resource must target the configured repository name."
  }

  assert {
    condition     = github_actions_secret.shared["joshtsch/project-two/SHARED"].value == "synthetic-value"
    error_message = "The configured shared value must be supplied to every target resource."
  }
}

run "empty_secret_map_creates_no_shared_resources" {
  command = plan

  variables {
    github_project_repositories = ["joshtsch/project-one"]
    shared_actions_secrets      = {}
  }

  assert {
    condition     = length(github_actions_secret.shared) == 0
    error_message = "No shared secret resources should be planned without configured values."
  }
}

run "rejects_repositories_outside_the_configured_owner" {
  command = plan

  variables {
    github_project_repositories = ["other-owner/project-one"]
    shared_actions_secrets      = {}
  }

  expect_failures = [var.github_project_repositories]
}
