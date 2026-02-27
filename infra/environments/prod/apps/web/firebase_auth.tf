# infra/environments/prod/apps/web/firebase_auth.tf

# ------------------------------------------------------------
# FirebaseプロジェクトにGoogle Cloud Platformプロジェクトを登録
# ------------------------------------------------------------
resource "google_firebase_project" "this" {
  provider = google-beta
  project  = var.project_id

  depends_on = [
    google_project_service.apis["firebase.googleapis.com"],
  ]
}

# ------------------------------------------------------------
# Firebase Web App用のAPI Keyをつくる
# - URL制限をかけてクォータ盗用・濫用抑止
# ------------------------------------------------------------
resource "google_apikeys_key" "firebase_web" {
  provider     = google-beta
  project      = var.project_id
  name         = "firebase-web"
  display_name = "Coffee AI Mentor - Firebase Web API Key"

  restrictions {
    browser_key_restrictions {
      # 指定したURLからの呼び出しのみ許可
      # - 何も指定しなければ、本番URLとローカル開発を許可
      allowed_referrers = (
        var.firebase_allowed_referrers != null
        ? distinct(var.firebase_allowed_referrers)
        : distinct([
          # デフォルト値
          # http(s)?://からはじまり、スラッシュまでを抽出（例：https://example.com）
          "${regex("^https?://[^/]+", google_cloud_run_v2_service.web.uri)}/*",
          # Firebase Authのiframe/handlerの参照元
          "https://${var.project_id}.firebaseapp.com/*",
          "https://${var.project_id}.web.app/*",
          # ローカル開発も許可
          "http://127.0.0.1:3000/*",
          "https://127.0.0.1:3000/*",
        ])
      )
    }
  }

  depends_on = [
    google_project_service.apis["apikeys.googleapis.com"],
  ]
}

# ------------------------------------------------------------
# Firebaseプロジェクトの中にWebアプリ用のIDを作成
# ------------------------------------------------------------
resource "google_firebase_web_app" "web" {
  provider     = google-beta
  project      = var.project_id
  display_name = var.firebase_web_app_display_name

  # WebAppをdestroyで消さず、stateから外す（本番運用向け）
  deletion_policy = "ABANDON"

  lifecycle {
    # 誤削除防止（本番はtrue推奨）
    prevent_destroy = true
  }

  # 上記で自作したAPI Keyを紐づける
  api_key_id = google_apikeys_key.firebase_web.uid

  depends_on = [
    google_firebase_project.this,
  ]
}

# Firebase Web SDK設定の取得用（CLIから取得し、.env.localやGitHub variablesに設定）
data "google_firebase_web_app_config" "web" {
  provider   = google-beta
  web_app_id = google_firebase_web_app.web.app_id
}

# ------------------------------------------------------------
# Identity Platform設定
# - Firebase Auth用の認証基盤として
# 1) Email/Password認証と匿名認証の有効化設定
# 2) Google OAuthサインインの有効化設定
# ------------------------------------------------------------

# 1) Email/Password認証と匿名認証の有効化設定
resource "google_identity_platform_config" "default" {
  provider = google-beta
  project  = var.project_id

  sign_in {
    email {
      enabled           = var.firebase_email_auth_enabled
      password_required = var.firebase_email_password_required
    }
    anonymous {
      enabled = var.firebase_anonymous_enabled
    }
  }

  # エンドユーザー自身によるアカウント作成/削除の可否
  # - Admin SDK での管理操作は別経路のため対象外
  client {
    permissions {
      # ユーザーの自己登録を許可
      # - OAuthサインインはユーザー自身による登録になるため、Google OAuthサインインを有効にする場合はtrueにする必要あり
      disabled_user_signup   = false
      # ユーザー自身によるアカウント削除を禁止
      # - ユーザーが誤ってアカウントを削除してしまうのを防止
      disabled_user_deletion = true
    }
  }

  # Identity Platform のリクエストログを Cloud Logging に出す
  # - 急増時の手動調査に使う（通知アラートは未使用）
  monitoring {
    request_logging {
      enabled = true
    }
  }

  # 許可するドメイン一覧
  # - ユーザー指定があればそれを使う
  authorized_domains = (
    var.firebase_authorized_domains != null
    ? distinct(var.firebase_authorized_domains)
    : distinct([
      # http(s)?://の1字後からはじまり、スラッシュまでを抽出（例：example.com）
      regex("^https?://([^/]+)", google_cloud_run_v2_service.web.uri)[0],
      "${var.project_id}.firebaseapp.com",
      "${var.project_id}.web.app",
      "127.0.0.1",
    ])
  )

  # identitytoolkitクォータ調整
  # - 新規サインアップ抑制（DDoS対策）
  quota {
    dynamic "sign_up_quota_config" {
      for_each = var.identity_platform_sign_up_quota != null ? [1] : []
      content {
        quota          = var.identity_platform_sign_up_quota
        # Sign-up quotaの開始時刻（RFC3339）。未来にする必要があるため、即採用ならtimeadd(timestamp(), "1m")
        # - 例: 2026-01-01T00:00:00Z
        start_time     = timeadd(timestamp(), "1m")
        quota_duration = var.identity_platform_sign_up_quota_duration
      }
    }
  }

  lifecycle {
    # start_timeの変更を無視することで、毎回のApplyでの更新を防ぐ（変更する場合は外す）
    ignore_changes = [
      quota[0].sign_up_quota_config[0].start_time,
    ]
  }

  depends_on = [
    google_project_service.apis["identitytoolkit.googleapis.com"],
    google_firebase_project.this,
  ]
}

# 2) Google OAuthサインインの有効化設定
resource "google_identity_platform_default_supported_idp_config" "google" {
  count         = var.firebase_google_sign_in_enabled ? 1 : 0
  project       = var.project_id
  enabled       = true
  idp_id        = "google.com"
  # 直接UIからOAuth同意画面を設定し、認証情報を作成して取得する必要あり（Terraformでは不可）
  client_id     = var.firebase_google_oauth_client_id
  # 直接UIからOAuth同意画面を設定し、認証情報を作成して取得する必要あり（Terraformでは不可）
  # - GitHub Actionsのsecretから TF_VAR_firebase_google_oauth_client_secret 経由で値を渡す想定
  client_secret = var.firebase_google_oauth_client_secret

  depends_on = [
    google_identity_platform_config.default,
  ]
}

# ------------------------------------------------------------
# reCAPTCHA Enterpriseの設定（Firebase App Check用）
# ------------------------------------------------------------

# reCAPTCHA Enterprise（App Checkは “score-based site key” が必要）
# - integration_type=SCORE
# resource "google_recaptcha_enterprise_key" "app_check_web" {
#   project      = var.project_id
#   display_name = "coffee-ai-mentor-web-appcheck"

#   web_settings {
#     integration_type  = "SCORE"
#     allow_all_domains = false
#     # 指定したドメインからの実行のみ許可
#     allowed_domains   = distinct(concat(
#       [regex("^https?://([^/]+)", google_cloud_run_v2_service.web.uri)[0]],
#       var.app_check_allowed_domains_additional,
#     ))
#     allow_amp_traffic = false
#   }

#   depends_on = [
#     google_project_service.apis["recaptchaenterprise.googleapis.com"],
#   ]
# }

# App Check (reCAPTCHA Enterprise) をWeb Appに紐付け
# resource "google_firebase_app_check_recaptcha_enterprise_config" "web" {
#   provider = google-beta
#   project  = var.project_id
#   app_id   = google_firebase_web_app.web.app_id

#   # reCAPTCHA Enterpriseのsite keyのリソース名を指定
#   site_key  = google_recaptcha_enterprise_key.app_check_web.name
#   # トークンの有効期限設定
#   token_ttl = var.app_check_token_ttl

#   depends_on = [
#     google_project_service.apis["firebaseappcheck.googleapis.com"],
#   ]
# }
