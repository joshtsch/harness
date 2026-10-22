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

variable "project_workspace_organizations" {
  description = "Project workspaces assigned to dedicated HCP Terraform organizations; omitted workspaces use tfe_organization."
  type        = map(string)
  default     = {}
}

variable "project_organization_names" {
  description = "HCP Terraform organizations explicitly managed for projects."
  type        = set(string)
  default     = []
  validation {
    condition     = alltrue([for name in var.project_organization_names : can(regex("^[a-zA-Z0-9][a-zA-Z0-9_-]{0,89}$", name))])
    error_message = "Project organization names must be valid HCP organization names."
  }
}

variable "project_organization_admin_emails" {
  description = "Required administrative contact email for each new project organization, supplied through protected HCP workspace variables."
  type        = map(string)
  default     = {}
  sensitive   = true
}
