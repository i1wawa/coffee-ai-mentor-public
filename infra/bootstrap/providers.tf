# infra/bootstrap/providers.tf

provider "google" {
  project = var.project_id

  # User ADC（ローカルADC）で叩くときに強制的に指定のプロジェクトを使うように
  user_project_override = true
  billing_project       = var.project_id
}
