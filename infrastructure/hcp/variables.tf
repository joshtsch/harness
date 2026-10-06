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
