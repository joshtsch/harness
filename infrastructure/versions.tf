terraform {
  required_version = ">= 1.6.0"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
  }

  # This repository's infrastructure shares the existing HCP workspace and state.
  backend "remote" {}
}

provider "github" {
  owner = var.github_owner
}

provider "supabase" {}
