# infra/environments/prod/apps/web/cloud_run.tf

# ------------------------------------------------------------
# Cloud Runのサービスエージェント
# - Cloud Run自身が自身のリソースを操作するために使用
# ------------------------------------------------------------

resource "google_project_service_identity" "run_service_agent" {
  provider = google-beta
  project  = var.project_id
  service  = "run.googleapis.com"

  depends_on = [
    google_project_service.apis["run.googleapis.com"],
  ]
}

# ------------------------------------------------------------
# Cloud Run Service（2段階適用）
# - 先にSecretリソースを作り、手動で値を投入してからCloud Runを作る
# ------------------------------------------------------------

resource "google_cloud_run_v2_service" "web" {
  project  = var.project_id
  name     = var.service_name
  location = var.region

  # 誤削除防止（本番はtrue推奨）
  deletion_protection = var.deletion_protection

  # アクセス制限（公開）
  ingress = "INGRESS_TRAFFIC_ALL"
  labels  = local.labels

  lifecycle {
    # コンテナイメージの更新をしないように（CDで更新するため）
    ignore_changes = [
      template[0].containers[0].image
    ]
  }

  template {
    service_account                  = google_service_account.runtime.email
    max_instance_request_concurrency = var.max_concurrency
    timeout                          = var.request_timeout

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      # コンテナイメージ
      image = var.container_image

      # Next.js（Cloud Runは8080が多い）
      ports {
        container_port = 8080
        name           = "http1"
      }

      resources {
        # リクエストを処理している時間のみ課金
        cpu_idle = true
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # インスタンスの起動中のみ、CPUが2倍になる
        startup_cpu_boost = true
      }

      # ----------------------------
      # Secrets
      # - リソースだけ作る（値は作らない）
      # - Terraform stateに秘匿値を残さず、手動で値を投入する運用想定
      # ----------------------------

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["gemini_api_key"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "RESEND_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["resend_api_key"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "SUPABASE_SERVICE_ROLE_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["supabase_service_role_key"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["database_url"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "USER_HASH_SALT"
        value_source {
          secret_key_ref {
            secret = google_secret_manager_secret.secrets["user_hash_salt"].secret_id
            version = "latest"
          }
        }
      }
    }
  }

  depends_on = [
    # API
    google_project_service.apis["run.googleapis.com"],
    google_project_service.apis["secretmanager.googleapis.com"],
    google_project_service.apis["artifactregistry.googleapis.com"],

    # 権限
    google_secret_manager_secret_iam_member.runtime_secret_accessor,
    google_artifact_registry_repository_iam_member.run_agent_artifact_reader,
    google_service_account_iam_member.run_agent_token_creator_on_runtime_sa,
  ]
}
