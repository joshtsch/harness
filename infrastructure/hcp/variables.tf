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

variable "tfe_provider_token" {
  description = "Optional protected user token for cross-organization provider operations; null retains environment/CLI authentication."
  type        = string
  default     = null
  sensitive   = true
  validation {
    condition     = var.tfe_provider_token == null ? true : length(trimspace(var.tfe_provider_token)) > 0
    error_message = "The supplied provider token must be nonempty."
  }
}

variable "project_workspace_variables" {
  description = "Complete protected input inventory for registered project workspaces; all values are literal strings."
  type = map(object({
    environment = optional(map(string), {})
    terraform   = optional(map(string), {})
  }))
  default   = {}
  nullable  = false
  sensitive = true
  validation {
    condition = alltrue(flatten([
      for workspace, categories in var.project_workspace_variables : [
        for category, variables in categories : [
          for key, value in variables : can(regex("^[A-Za-z_][A-Za-z0-9_]*$", key)) && value != null
        ]
      ]
    ]))
    error_message = "Project variable keys must be valid identifiers and values must be non-null strings."
  }
}

variable "project_workspace_vcs" {
  description = "Complete private GitHub App connection inventory for project workspaces."
  type = map(object({
    identifier                 = string
    branch                     = string
    working_directory          = string
    github_app_installation_id = string
  }))
  default   = {}
  nullable  = false
  sensitive = true
  validation {
    condition = alltrue([
      for vcs in values(var.project_workspace_vcs) :
      can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", vcs.identifier)) &&
      can(regex("^ghain-[A-Za-z0-9]+$", vcs.github_app_installation_id)) &&
      can(regex("^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$", vcs.working_directory)) &&
      !contains(split("/", vcs.working_directory), ".") && !contains(split("/", vcs.working_directory), "..") &&
      length(trimspace(vcs.branch)) > 0
    ])
    error_message = "VCS inputs require a GitHub owner/repository, branch, relative working directory, and HCP ghain installation ID."
  }
}
