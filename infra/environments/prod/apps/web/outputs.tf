# infra/environments/prod/apps/web/outputs.tf

# ============================================================
# Google Cloud
# ============================================================

output "artifact_registry_repository" {
  description = "Artifact Registryリポジトリ名"
  value       = google_artifact_registry_repository.web.name
}

output "runtime_service_account_email" {
  description = "Cloud Run実行用サービスアカウントのメールアドレス"
  value       = google_service_account.runtime.email
}

output "cloud_run_service_url" {
  description = "Cloud Run URL"
  value       = google_cloud_run_v2_service.web.uri
}

output "wif_provider_resource_name" {
  description = "GitHub Actions auth action等で使うWIF providerのリソース名（WIF作成時のみ）"
  value       = var.github_repository != "" ? google_iam_workload_identity_pool_provider.github[0].name : null
}

# ------------------------------------------------------------
# GitHub Actionsのサービスアカウント・メールアドレス
# 1) デプロイ用（Cloud Runデプロイも許可）
# 2) Terraform実行用（Terraform applyも許可）
# 3) Terraform閲覧用（Terraform planまで許可）
# ------------------------------------------------------------

output "github_deployer_service_account_name" {
  description = "GitHub Actionsからのデプロイ用サービスアカウント"
  value       = google_service_account.github_deployer.name
}

output "github_deployer_service_account_email" {
  description = "GitHub Actionsからのデプロイ用サービスアカウントのメールアドレス"
  value       = google_service_account.github_deployer.email
}

output "github_terraform_runner_service_account_name" {
  value       = google_service_account.github_terraform_runner.name
  description = "GitHub ActionsのTerraform実行用サービスアカウント"
}

output "github_terraform_runner_service_account_email" {
  value       = google_service_account.github_terraform_runner.email
  description = "GitHub ActionsのTerraform実行用サービスアカウントのメールアドレス"
}

output "github_terraform_viewer_service_account_name" {
  value       = google_service_account.github_terraform_viewer.name
  description = "GitHub ActionsのTerraform閲覧用サービスアカウント"
}

output "github_terraform_viewer_service_account_email" {
  value       = google_service_account.github_terraform_viewer.email
  description = "GitHub ActionsのTerraform閲覧用サービスアカウントのメールアドレス"
}

# ============================================================
# Sentry
# ============================================================

output "sentry_project_slug" {
  description = "Sentryプロジェクトのスラッグ"
  value       = sentry_project.web.slug
}

output "sentry_dsn_public" {
  description = "Sentry DSNキー"
  value       = sentry_key.web_dsn.dsn["public"]
  sensitive   = true
}

output "firebase_web_app_id" {
  description = "Firebase Web App の app_id"
  value       = google_firebase_web_app.web.app_id
}

output "firebase_web_config" {
  description = "Firebase Web App のクライアント設定（Next.js用）"
  value = {
    api_key      = data.google_firebase_web_app_config.web.api_key
    auth_domain  = data.google_firebase_web_app_config.web.auth_domain
    project_id   = var.project_id
    app_id       = google_firebase_web_app.web.app_id
  }
}

output "identity_platform_authorized_domains" {
  description = "Identity Platform authorized domains"
  value       = google_identity_platform_config.default.authorized_domains
}

# output "recaptcha_enterprise_site_key_for_app_check" {
#   description = "reCAPTCHA Enterprise site key (App Check用)"
#   value       = google_recaptcha_enterprise_key.app_check_web.name
# }
