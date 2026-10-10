variable "tfe_hostname" {
  description = "HCP Terraform hostname."
  type        = string
  default     = "app.terraform.io"
}

variable "tfe_organization" {
  description = "Existing HCP Terraform organization that owns the workspaces."
  type        = string
}

variable "harness_workspace_name" {
  description = "HCP Terraform workspace for the harness repository."
  type        = string
  default     = "harness"
}

variable "project_workspace_names" {
  description = "Repository workspace names supplied through private, persistent HCP variables."
  type        = set(string)
  default     = []
  validation {
    condition     = alltrue([for name in var.project_workspace_names : can(regex("^[a-zA-Z0-9][a-zA-Z0-9_-]{0,89}$", name))])
    error_message = "Workspace names must be 1-90 alphanumeric, underscore, or hyphen characters, with an alphanumeric first character."
  }
}
