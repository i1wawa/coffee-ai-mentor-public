# infra/bootstrap/outputs.tf

output "state_bucket_name" {
  value       = google_storage_bucket.tfstate.name
  description = "Terraform state用GCSバケット名"
}
