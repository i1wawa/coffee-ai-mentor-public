# infra/environments/prod/apps/web/iam.tf

# ------------------------------------------------------------
# Cloud Run実行用サービスアカウントに必要な権限を付与
# 1) Secret Managerの権限（Secretの読み取り権限）
# 2) Firebase Authenticationの管理権限（session cookie発行/検証に必要）
# ------------------------------------------------------------

# 1) Secret Managerの権限（Secretの読み取り権限）
resource "google_secret_manager_secret_iam_member" "runtime_secret_accessor" {
  for_each  = google_secret_manager_secret.secrets
  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# 2) Firebase Authenticationの管理権限（session cookie発行/検証に必要）
resource "google_project_iam_member" "runtime_firebaseauth_admin" {
  project = var.project_id
  role    = "roles/firebaseauth.admin"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# ------------------------------------------------------------
# Cloud Runサービスエージェントに必要な権限を付与
# 1) Artifact Registryリポジトリのコンテナイメージを取得する権限
# 2) Cloud Run実行用サービスアカウントの認証トークンを発行する権限
# ------------------------------------------------------------

# 1) Artifact Registryリポジトリのコンテナイメージを取得する権限
resource "google_artifact_registry_repository_iam_member" "run_agent_artifact_reader" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.web.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_project_service_identity.run_service_agent.email}"
}

# 2) Cloud Run実行用サービスアカウントの認証トークンを発行する権限
resource "google_service_account_iam_member" "run_agent_token_creator_on_runtime_sa" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_project_service_identity.run_service_agent.email}"
}

# ------------------------------------------------------------
# GitHub Actionsからのデプロイ用サービスアカウントに必要な権限を付与
# 1) Cloud Runへのデプロイ権限（Cloud Runのデプロイ・リビジョン・トラフィック・ジョブの操作）
# 2) Cloud Run実行用サービスアカウントを利用する権限
# 3) Secret Managerからdatabase_urlを取得する権限
# 4) Artifact Registryリポジトリへコンテナイメージを保存する権限
# ------------------------------------------------------------

# 1) Cloud Runへのデプロイ権限（Cloud Runのデプロイ・リビジョン・トラフィック・ジョブの操作）
resource "google_project_iam_member" "github_deployer_run_deployer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.github_deployer.email}"
}

# 2) Cloud Run実行用サービスアカウントを利用する権限
resource "google_service_account_iam_member" "github_deployer_sa_user_on_runtime_sa" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deployer.email}"
}

# 3) Secret Managerからdatabase_urlを取得する権限
resource "google_secret_manager_secret_iam_member" "github_deployer_database_url_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets["database_url"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.github_deployer.email}"
}

# 4) Artifact Registryリポジトリへコンテナイメージを保存する権限
resource "google_artifact_registry_repository_iam_member" "github_deployer_artifact_writer" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.web.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_deployer.email}"
}

# ------------------------------------------------------------
# GitHub ActionsからのTerraform閲覧用サービスアカウントに必要な権限を付与
# 1) プロジェクト内のリソースを閲覧する権限
# 2) IAM設定を閲覧する権限
# 3) APIを利用する権限
# 4) Firebase関連リソースの閲覧権限
# 5) API Keys関連リソースの閲覧権限
# 6) Cloud Loggingの閲覧権限
# ------------------------------------------------------------

# 1) プロジェクト内のリソースを閲覧する権限
resource "google_project_iam_member" "github_terraform_viewer_viewer" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${google_service_account.github_terraform_viewer.email}"
}

# 2) IAM設定を閲覧する権限
resource "google_project_iam_member" "github_terraform_viewer_iam_security_reviewer" {
  project = var.project_id
  role    = "roles/iam.securityReviewer"
  member  = "serviceAccount:${google_service_account.github_terraform_viewer.email}"
}

# 3) APIを利用する権限
resource "google_project_iam_member" "github_terraform_viewer_serviceusage_viewer" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.github_terraform_viewer.email}"
}

# 4) Firebase関連リソースの閲覧権限
resource "google_project_iam_member" "github_terraform_viewer_firebase_viewer" {
  project = var.project_id
  role    = "roles/firebase.viewer"
  member  = "serviceAccount:${google_service_account.github_terraform_viewer.email}"
}

# 5) API Keys関連リソースの閲覧権限
resource "google_project_iam_member" "github_terraform_viewer_api_keys_viewer" {
  project = var.project_id
  role    = "roles/serviceusage.apiKeysViewer"
  member  = "serviceAccount:${google_service_account.github_terraform_viewer.email}"
}

# 6) Cloud Loggingの閲覧権限
resource "google_project_iam_member" "github_terraform_viewer_logging_viewer" {
  project = var.project_id
  role    = "roles/logging.viewer"
  member  = "serviceAccount:${google_service_account.github_terraform_viewer.email}"
}

# ------------------------------------------------------------
# GitHub ActionsからのTerraform実行用サービスアカウントに必要な権限を付与
# 1) APIの使用を管理する権限
# 2) APIを利用する権限
# 3) Firebase関連リソースを管理する権限
# 4) API Keys関連リソースを管理する権限
# 5) サービスアカウントを管理する権限
# 6) プロジェクト内のIAMを管理する権限
# 7) WIFを管理する権限
# 8) Secret Managerを管理する権限
# 9) Artifact Registryを管理する権限
# 10) Cloud Runを管理する権限
# 11) Cloud Run実行用サービスアカウントを利用する権限
# 12) Cloud Loggingの設定管理権限
# ------------------------------------------------------------

# 1) APIの使用を管理する権限
resource "google_project_iam_member" "github_terraform_serviceusage_admin" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageAdmin"
  member  = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# 2) APIを利用する権限
resource "google_project_iam_member" "github_terraform_serviceusage_consumer" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# 3) Firebase関連リソースを管理する権限
resource "google_project_iam_member" "github_terraform_firebase_admin" {
  project = var.project_id
  role    = "roles/firebase.admin"
  member  = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# 4) API Keys関連リソースを管理する権限
resource "google_project_iam_member" "github_terraform_api_keys_admin" {
  project = var.project_id
  role    = "roles/serviceusage.apiKeysAdmin"
  member  = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# 5) サービスアカウントを管理する権限
resource "google_project_iam_member" "github_terraform_sa_admin" {
  project = var.project_id
  role    = "roles/iam.serviceAccountAdmin"
  member  = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# 6) プロジェクト内のIAMを管理する権限
resource "google_project_iam_member" "github_terraform_project_iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# 7) WIFを管理する権限
resource "google_project_iam_member" "github_terraform_wif_admin" {
  project = var.project_id
  role    = "roles/iam.workloadIdentityPoolAdmin"
  member  = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# 8) Secret Managerを管理する権限
resource "google_project_iam_member" "github_terraform_secret_admin" {
  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# 9) Artifact Registryを管理する権限
resource "google_project_iam_member" "github_terraform_artifact_admin" {
  project = var.project_id
  role    = "roles/artifactregistry.admin"
  member  = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# 10) Cloud Runを管理する権限
resource "google_project_iam_member" "github_terraform_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# 11) Cloud Run実行用サービスアカウントを利用する権限（iam.serviceaccounts.actAs）
resource "google_service_account_iam_member" "github_terraform_runner_sa_user_on_runtime_sa" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# 12) Cloud Loggingの設定管理権限
resource "google_project_iam_member" "github_terraform_logging_config_writer" {
  project = var.project_id
  role    = "roles/logging.configWriter"
  member  = "serviceAccount:${google_service_account.github_terraform_runner.email}"
}

# ------------------------------------------------------------
# Cloud Runサービスに必要な権限を付与
# - allUsersの権限（Cloud RunのWeb公開）
# ------------------------------------------------------------

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  # 認証なしでのアクセス（一般公開）を許可する場合のみ作成
  count    = var.allow_unauthenticated ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
