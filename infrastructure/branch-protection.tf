# Coverage checked 2 November 2026: integrations/github 6.13 supports required checks.
# Import an existing rule before adoption; keep this in the harness HCP state.
resource "github_branch_protection" "harness_quality" {
  repository_id  = github_repository.public_harness.node_id
  pattern        = "main"
  enforce_admins = true

  required_status_checks {
    strict   = true
    contexts = ["Harness quality", "PR issue link"]
  }
}
