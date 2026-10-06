variable "github_owner" {
  description = "GitHub owner of the repository."
  type        = string
  default     = "joshtsch"
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
