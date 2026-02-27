# infra/bootstrap/backend.tf

terraform {
  # ------------------------------------------------------------
  # Terraform state（GCS）バックエンド設定
  # ------------------------------------------------------------

  backend "gcs" {
    # bootstrapで作ったtfstateバケット名
    bucket = "coffee-ai-mentor-bootstrap-tfstate-us-central1"

    # このroot moduleの論理パスに合わせる
    prefix = "bootstrap"
  }
}
