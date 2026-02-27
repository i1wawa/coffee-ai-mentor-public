# infra/environments/prod/apps/web/locals.tf

locals {
  # ------------------------------------------------------------
  # トラッキング用の共通ラベル
  # ------------------------------------------------------------

  labels = {
    "managed-by"  = "terraform"
    "environment" = var.environment
    "system"      = "coffee-ai-mentor"
    "app"         = "web"
  }

  # ------------------------------------------------------------
  # 必要なAPIの指定
  # ------------------------------------------------------------

  required_apis = toset([
    # Cloud Run
    "run.googleapis.com",
    # Artifact Registry
    "artifactregistry.googleapis.com",
    # Secret Manager
    "secretmanager.googleapis.com",
    # IAM
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    # WIF用
    "sts.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    # Observability
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    # Firebase Auth
    "firebase.googleapis.com",
    "identitytoolkit.googleapis.com",
    # Firebase App Check
    # "firebaseappcheck.googleapis.com",
    # "recaptchaenterprise.googleapis.com",
    # APIキー作成用
    "apikeys.googleapis.com",
    # Quota調整用
    # "cloudquotas.googleapis.com",
  ])

  # ------------------------------------------------------------
  # Secrets名
  # ------------------------------------------------------------

  secret_ids = {
    gemini_api_key            = "gemini-api-key-prod"
    resend_api_key            = "resend-api-key-prod"
    supabase_service_role_key = "supabase-service-role-key-prod"
    database_url              = "database-url-prod"
    user_hash_salt             = "user-hash-salt-prod"
  }
}
