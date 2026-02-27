# infra/environments/prod/apps/web/variables.tf

# ------------------------------------------------------------
# 基本
# ------------------------------------------------------------

variable "project_id" {
  type        = string
  description = "Google Cloud / Sentryの本番プロジェクトID（例: coffee-ai-mentor-prod）"
}

variable "region" {
  type        = string
  description = "Google Cloud Run / Google Cloud Artifact Registryのリージョン"
  default     = "asia-northeast1"
}

variable "environment" {
  type        = string
  description = "Google Cloud / Sentryの環境名ラベル用"
  default     = "prod"
  validation {
    condition     = var.environment == "prod"
    error_message = "このroot moduleはprod専用です。environmentはprod固定にしてください。"
  }
}

variable "organization" {
  type        = string
  description = "Sentryの組織名"
  default     = "i1wawa-org"
}

variable "team" {
  type        = string
  description = "Sentryのチーム名"
  default     = "coffee-ai-mentor"
}

# ------------------------------------------------------------
# Google Cloud Run
# ------------------------------------------------------------

variable "service_name" {
  type        = string
  description = "Cloud Runサービス名"
  default     = "coffee-ai-mentor-web"
}

variable "container_image" {
  type        = string
  description = "Cloud RunにデプロイするコンテナイメージURI（Artifact Registry推奨）。"
}

variable "max_instances" {
  type        = number
  description = "トラフィックに応じて自動的にスケールアウトできるインスタンス数の上限"
  default     = 1
  validation {
    condition     = var.max_instances == 1
    error_message = "無料枠前提のため、max_instancesは1にしてください。"
  }
}

variable "min_instances" {
  type        = number
  description = "サービスが常に稼働させておくべき最低限のコンテナインスタンス数"
  default     = 0
  validation {
    condition     = var.min_instances == 0
    error_message = "無料枠前提のため、min_instancesは0にしてください。"
  }
}

variable "request_timeout" {
  type        = string
  description = "Cloud Runのリクエストタイムアウト（例: 60s, 300s）"
  default     = "60s"
}

variable "max_concurrency" {
  type        = number
  description = "1インスタンスあたり同時リクエスト上限（Next.jsはデフォルト寄りでOK）"
  default     = 80
}

variable "allow_unauthenticated" {
  type        = bool
  description = "認証なしでのアクセス（一般公開）を許可するかどうか。"
  default     = true
}

variable "deletion_protection" {
  type        = bool
  description = "Google CloudコンソールやAPI、Terraformからの削除リクエストを防止するかどうか。"
  default     = true
}

# ------------------------------------------------------------
# Google Cloud Artifact Registry
# ------------------------------------------------------------

variable "artifact_repo_id" {
  type        = string
  description = "Artifact RegistryリポジトリID（Dockerイメージ用）"
  default     = "coffee-ai-mentor"
}

variable "artifact_cleanup_dry_run" {
  type        = bool
  description = "Artifact Registryのコンテナイメージ削除をdry-runで動かすか"
  default     = true
}

variable "artifact_cleanup_keep_count" {
  type        = number
  description = "残すコンテナイメージ数（最新N件）"
  default     = 1
  validation {
    condition     = var.artifact_cleanup_keep_count >= 1 && var.artifact_cleanup_keep_count <= 3
    error_message = "keep_countは1〜3に抑えてください。"
  }
}

# ------------------------------------------------------------
# Google Cloud Workload Identity Federation（WIF）
# - サービスアカウントキーを置かない運用のためにWIFを使う
# ------------------------------------------------------------

variable "github_repository" {
  type        = string
  description = "許可するGitHubリポジトリ（例: your-org/coffee-ai-mentor）。空ならWIFを作らない。"
  default     = ""
}

variable "github_allowed_ref" {
  type        = string
  description = "許可するGitHubブランチ／タグ（例: refs/heads/main）"
  default     = "refs/heads/main"
}

# ------------------------------------------------------------
# Firebase Auth (Identity Platform)
# ------------------------------------------------------------

variable "firebase_web_app_display_name" {
  type        = string
  description = "Firebase Web Appの表示名"
  default     = "Coffee AI Mentor Web"
}

variable "firebase_authorized_domains" {
  type        = list(string)
  description = "Identity Platform（Firebase Auth用の認証基盤）の許可するドメイン一覧を上書きしたい場合に指定（nullならハードコーディングしている値）"
  default     = null
}

variable "firebase_email_auth_enabled" {
  type        = bool
  description = "Email認証を有効化"
  default     = false
}

variable "firebase_email_password_required" {
  type        = bool
  description = "Email認証でパスワード必須にする（falseならメールリンクも許可）"
  default     = false
}

variable "firebase_anonymous_enabled" {
  type        = bool
  description = "匿名認証を有効化"
  default     = false
}

variable "firebase_google_sign_in_enabled" {
  type        = bool
  description = "Googleサインインを有効化（OAuth Client ID/Secretが必要）"
  default     = true
}

variable "identity_platform_sign_up_quota" {
  type        = number
  description = "一定期間内の新規サインアップ上限（nullなら未設定）"
  default     = 50
}

variable "identity_platform_sign_up_quota_duration" {
  type        = string
  description = "Sign-up quotaの有効期間（秒 + s）。例: 7200s（2時間）"
  default     = "7200s"
}

# 直接UIからOAuth同意画面を設定し、認証情報を作成して取得する必要あり（Terraformでは不可）
variable "firebase_google_oauth_client_id" {
  type        = string
  description = "Google OAuth Client ID（firebase_google_sign_in_enabled=trueの場合に設定）"
  default     = ""
}

# 直接UIからOAuth同意画面を設定し、認証情報を作成して取得する必要あり（Terraformでは不可）
# - GitHub Actionsのsecretから TF_VAR_firebase_google_oauth_client_secret 経由で値を渡す想定
variable "firebase_google_oauth_client_secret" {
  type        = string
  description = "Google OAuth Client Secret（firebase_google_sign_in_enabled=trueの場合に設定）"
  sensitive   = true
  default     = ""
}

variable "firebase_allowed_referrers" {
  type        = list(string)
  description = "API Key の allowed_referrers を上書きしたい場合に指定（nullなら自動）"
  default     = null
}

# ------------------------------------------------------------
# App Check (reCAPTCHA Enterprise)
# ------------------------------------------------------------

# variable "app_check_token_ttl" {
#   type        = string
#   description = "App CheckトークンTTL（有効期限） 例: 3600s"
#   default     = "3600s"
# }

# variable "app_check_allowed_domains_additional" {
#   type        = list(string)
#   description = "reCAPTCHA Enterpriseの追加許可ドメイン"
#   default     = []
# }

# ------------------------------------------------------------
# Sentry
# ------------------------------------------------------------

# GitHub Actionsのsecretから SENTRY_AUTH_TOKEN 経由で値を渡す想定
# - token 変数を直接指定すると、上記で渡せない＆Terraformのstateファイルに平文で保存されてしまうのでやらない
# variable "sentry_auth_token" {
#   type        = string
#   description = "Sentry認証トークン（Internal Integration token）。"
#   sensitive   = true
# }
