variable "github_owner" {
  description = "GitHub owner of the repository."
  type        = string
  default     = "joshtsch"
}

variable "github_project_repositories" {
  description = "Private HCP input containing owner/repository slugs for configured GitHub projects that receive shared Actions secrets."
  type        = set(string)
  default     = []

  validation {
    condition = alltrue([
      for repository in var.github_project_repositories :
      startswith(repository, "${var.github_owner}/") && length(split("/", repository)) == 2
    ])
    error_message = "Each configured GitHub project repository must use the configured github_owner/repository format."
  }
}

variable "shared_actions_secrets" {
  description = "Shared GitHub Actions secret names and values managed across configured project repositories. Values are stored in Terraform state."
  type        = map(string)
  sensitive   = true
  default     = {}

  validation {
    condition = alltrue([
      for name, value in var.shared_actions_secrets :
      can(regex("^[A-Z_][A-Z0-9_]*$", name)) && length(value) > 0
    ])
    error_message = "Secret names must be uppercase environment-style names and values must be non-empty."
  }
}

variable "repository_name" {
  description = "Name of the existing private historical repository after cutover."
  type        = string
  default     = "harness-private-archive"
}

variable "archive_private_repository" {
  description = "Make the private historical repository read-only after the fresh repository passes verification."
  type        = bool
  default     = false
}

variable "public_repository_visibility" {
  description = "Visibility of the fresh harness repository; keep private until the publication gate passes."
  type        = string
  default     = "private"

  validation {
    condition     = contains(["public", "private"], var.public_repository_visibility)
    error_message = "public_repository_visibility must be public or private."
  }
}

variable "organization_id" {
  description = "Supabase organization slug that owns the Harness continuation project."
  type        = string
}

variable "database_password" {
  description = "Database password supplied as a sensitive HCP Terraform variable."
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Supabase project name."
  type        = string
  default     = "harness-continuation"
}

variable "region" {
  description = "Supabase project region."
  type        = string
  default     = "ca-central-1"
}
