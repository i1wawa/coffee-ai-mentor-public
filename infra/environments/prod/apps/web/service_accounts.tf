# infra/environments/prod/apps/web/service_accounts.tf

# ------------------------------------------------------------
# Cloud Run実行用サービスアカウント
# - アプリがSecret Managerを読む等の最小権限を付与するため
# ------------------------------------------------------------

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "web-runtime"
  display_name = "Coffee AI Mentor Web Runtime"

  lifecycle {
    # 誤削除防止（本番はtrue推奨）
    prevent_destroy = true
  }
}

# ------------------------------------------------------------
# GitHub Actions用サービスアカウント
# 1) デプロイ用（Cloud Runにコンテナイメージをプッシュなどを許可）
# 2) Terraform実行用（Terraform applyも許可）
# 3) Terraform閲覧用（Terraform planまで許可）
# ------------------------------------------------------------

resource "google_service_account" "github_deployer" {
  project      = var.project_id
  account_id   = "web-gha-deployer"
  display_name = "Coffee AI Mentor Web GitHub Actions deployer"

  lifecycle {
    # 誤削除防止（本番はtrue推奨）
    prevent_destroy = true
  }
}

resource "google_service_account" "github_terraform_runner" {
  project      = var.project_id
  # emailはgithub-terraform@<project>.iam.gserviceaccount.comになる
  account_id   = "web-tf-runner"
  display_name = "Coffee AI Mentor Web GitHub Terraform Runner"

  lifecycle {
    # 誤削除防止（本番はtrue推奨）
    prevent_destroy = true
  }
}

resource "google_service_account" "github_terraform_viewer" {
  project      = var.project_id
  # emailはgithub-terraform@<project>.iam.gserviceaccount.comになる
  account_id   = "web-tf-viewer"
  display_name = "Coffee AI Mentor Web GitHub Terraform Viewer"

  lifecycle {
    # 誤削除防止（本番はtrue推奨）
    prevent_destroy = true
  }
}
