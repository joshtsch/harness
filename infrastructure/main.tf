resource "github_repository" "harness" {
  name       = var.repository_name
  visibility = "private"
  archived   = var.archive_private_repository

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      has_issues,
      has_projects,
      ignore_vulnerability_alerts_during_read,
    ]
  }
}

resource "github_repository" "public_harness" {
  name       = "harness"
  visibility = var.public_repository_visibility
  has_issues = true

  depends_on = [github_repository.harness]

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  shared_actions_secret_targets = {
    for target in setproduct(
      var.github_project_repositories,
      nonsensitive(toset(keys(var.shared_actions_secrets))),
      ) : "${target[0]}/${target[1]}" => {
      repository  = split("/", target[0])[1]
      secret_name = target[1]
    }
  }
}

resource "github_actions_secret" "shared" {
  for_each = local.shared_actions_secret_targets

  repository  = each.value.repository
  secret_name = each.value.secret_name
  value       = var.shared_actions_secrets[each.value.secret_name]
}

resource "supabase_project" "harness" {
  organization_id   = var.organization_id
  name              = var.project_name
  database_password = var.database_password
  region            = var.region

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [database_password]
  }
}
