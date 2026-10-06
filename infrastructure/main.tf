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
