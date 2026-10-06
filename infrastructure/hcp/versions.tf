terraform {
  required_version = ">= 1.6.0"

  required_providers {
    tfe = {
      source  = "hashicorp/tfe"
      version = "~> 0.80"
    }
  }

  # Configure the organization and workspace with -backend-config during init.
  backend "remote" {}
}

provider "tfe" {
  hostname = var.tfe_hostname
}
