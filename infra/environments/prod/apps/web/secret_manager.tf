# infra/environments/prod/apps/web/secret_manager.tf


# ------------------------------------------------------------
# Secret Manager
# - リソースだけ作る（値は作らない）
# - Terraform stateに秘匿値を残さず、手動で値を投入する運用想定
# ------------------------------------------------------------

resource "google_secret_manager_secret" "secrets" {
  for_each  = local.secret_ids
  project   = var.project_id
  secret_id = each.value
  labels    = local.labels

  replication {
    auto {}
  }

  # 誤削除防止（本番はtrue推奨）
  deletion_protection = var.deletion_protection

  depends_on = [
    google_project_service.apis["secretmanager.googleapis.com"],
  ]
}
