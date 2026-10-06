output "project_ref" {
  description = "Supabase project reference."
  value       = supabase_project.harness.id
}

output "project_url" {
  description = "Supabase project Data API URL."
  value       = "https://${supabase_project.harness.id}.supabase.co"
}
