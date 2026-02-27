# infra/environments/prod/apps/web/providers.tf

provider "google" {
  project = var.project_id
  region  = var.region

  # User ADC（ローカルADC）で叩くときに強制的に指定のプロジェクトを使うように
  user_project_override = true
  billing_project       = var.project_id
}

# 一部のリソース（service identity等）で便利なケースがあるため併用
provider "google-beta" {
  project = var.project_id
  region  = var.region

  # User ADC（ローカルADC）で叩くときに強制的に指定のプロジェクトを使うように
  user_project_override = true
  billing_project       = var.project_id
}

provider "sentry" {
  # GitHub Actionsのsecretから SENTRY_AUTH_TOKEN 経由で値を渡す想定
  # - token 変数を直接指定すると、上記で渡せない＆Terraformのstateファイルに平文で保存されてしまうのでやらない
  # token = var.sentry_auth_token
}
