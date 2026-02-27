# infra/environments/prod/apps/web/artifact_registry.tf

# ------------------------------------------------------------
# Artifact Registryリポジトリ
# - コンテナイメージの保管先
# - イメージは最新N件のみ保持し、古いイメージは自動削除
# ------------------------------------------------------------

resource "google_artifact_registry_repository" "web" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_repo_id
  format        = "DOCKER"
  description   = "Coffee AI Mentor - web container images"
  labels        = local.labels

  lifecycle {
    # 誤削除防止（本番はtrue推奨）
    prevent_destroy = true
  }

  # dry-runで確認可能
  cleanup_policy_dry_run = var.artifact_cleanup_dry_run

  # 1秒以上経過したコンテナイメージを削除対象にする
  cleanup_policies {
    id     = "delete-almost-all"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "1s"

      # 任意：repo内で対象パッケージを絞るなら
      # package_name_prefixes = ["web"]
    }
  }

  # コンテナイメージは最新N件を残す
  cleanup_policies {
    id     = "keep-most-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = var.artifact_cleanup_keep_count

      # 任意：repo内で対象パッケージを絞るなら
      # package_name_prefixes = ["web"]
    }
  }

  depends_on = [
    google_project_service.apis["artifactregistry.googleapis.com"],
  ]
}