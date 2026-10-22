terraform {
  required_version = ">= 1.6.0"

  required_providers {
    tfe = {
      source  = "hashicorp/tfe"
      version = "~> 0.80"
    }
  }

  # Onboarding supplies the existing organization through TF_CLOUD_ORGANIZATION.
  cloud {
    workspaces {
      name = "platform-bootstrap"
    }
  }
}

provider "tfe" {
  hostname = var.tfe_hostname
  token    = (var.tfe_provider_token)
}
