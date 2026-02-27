# infra/bootstrap/main.tf

# ------------------------------------------------------------
# 他のTerraform stateからの閲覧設定
# - bootstrapのstateを閲覧
# ------------------------------------------------------------

data "terraform_remote_state" "prod" {
  backend = "gcs"
  config = {
    bucket = "coffee-ai-mentor-bootstrap-tfstate-us-central1"
    prefix = "prod/apps/web"
  }
}

# ------------------------------------------------------------
# Terraform state用GCSバケット
# ------------------------------------------------------------

resource "google_storage_bucket" "tfstate" {
  name          = var.state_bucket_name
  location      = var.location
  storage_class = var.storage_class

  # 誤削除時の復旧性向上のため、Versioningを有効化
  versioning {
    enabled = true
  }

  # コスト削減のため、古い世代を自動削除
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      with_state         = "ARCHIVED"
      num_newer_versions = var.max_archived_versions_to_keep
    }
  }

  lifecycle {
    # 誤削除防止（本番はtrue推奨）
    prevent_destroy = true
  }

  # ACLを避け、IAMで統制
  uniform_bucket_level_access = true

  # 公開事故をブロック
  public_access_prevention = "enforced"

  labels = {
    "managed-by" = "terraform"
    "purpose"    = "tfstate"
  }
}

# ------------------------------------------------------------
# GitHub ActionsからのTerraform実行用サービスアカウントに必要な権限を付与
# 1) APIを利用する権限
# 2) プロジェクトIAMを管理する権限
# ------------------------------------------------------------

# 1) APIを利用する権限
resource "google_project_iam_member" "github_terraform_serviceusage_consumer" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${data.terraform_remote_state.prod.outputs.github_terraform_runner_service_account_email}"
}

# 2) プロジェクトIAMを管理する権限
resource "google_project_iam_member" "github_terraform_project_iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${data.terraform_remote_state.prod.outputs.github_terraform_runner_service_account_email}"
}

# ------------------------------------------------------------
# IAM
# 1) オブジェクトとバケットの管理者に必要な権限を付与（break-glass用）
# 2) バケットのオブジェクトの管理者（Terraform applyも許可）に必要な権限を付与
# 3) バケットとそのメタデータ（Terraform stateを取得）の閲覧者に必要な権限を付与
# 4) バケットのオブジェクトの閲覧者（Terraform planまで許可）に必要な権限を付与
# 5) Terraform stateのロック用オブジェクトの管理者に必要な権限を付与（terraform planで必要）
# ------------------------------------------------------------

# 1) オブジェクトとバケットの管理者に必要な権限を付与（break-glass用）
resource "google_storage_bucket_iam_member" "admins" {
  for_each = setunion(
    # GitHub ActionsからのTerraform実行用サービスアカウント（prodで作成済み）のメールアドレス
    toset(["serviceAccount:${data.terraform_remote_state.prod.outputs.github_terraform_runner_service_account_email}"]),
    var.bucket_admin_members
  )
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.admin"
  member = each.value
}

# 2) バケットのオブジェクトの管理者（Terraform applyも許可）に必要な権限を付与
resource "google_storage_bucket_iam_member" "object_admin" {
  for_each = setunion(
    var.bucket_object_admin_members
  )
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.objectAdmin"
  member = each.value
}

# 3) バケットとそのメタデータ（Terraform stateを取得）の閲覧者に必要な権限を付与
resource "google_storage_bucket_iam_member" "bucket_viewer" {
  for_each = setunion(
    # GitHub ActionsからのTerraform閲覧用サービスアカウント（prodで作成済み）のメールアドレス
    toset(["serviceAccount:${data.terraform_remote_state.prod.outputs.github_terraform_viewer_service_account_email}"]),
    # GitHub ActionsからのTerraform実行用サービスアカウント（prodで作成済み）のメールアドレス
    toset(["serviceAccount:${data.terraform_remote_state.prod.outputs.github_terraform_runner_service_account_email}"]),
    var.bucket_object_admin_members,
    var.bucket_object_viewer_members
  )

  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.bucketViewer"
  member = each.value
}

# 4) バケットのオブジェクトの閲覧者（Terraform planまで許可）に必要な権限を付与
resource "google_storage_bucket_iam_member" "object_viewer" {
  for_each = setunion(
    # GitHub ActionsからのTerraform閲覧用サービスアカウント（prodで作成済み）のメールアドレス
    toset(["serviceAccount:${data.terraform_remote_state.prod.outputs.github_terraform_viewer_service_account_email}"]),
    var.bucket_object_viewer_members
  )
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.objectViewer"
  member = each.value
}

# 5) Terraform stateのロック用オブジェクトの管理者に必要な権限を付与（terraform planで必要）
resource "google_storage_bucket_iam_member" "viewer_lock_admin" {
  for_each = setunion(
    # GitHub ActionsからのTerraform閲覧用サービスアカウント（prodで作成済み）のメールアドレス
    toset(["serviceAccount:${data.terraform_remote_state.prod.outputs.github_terraform_viewer_service_account_email}"]),
    var.bucket_object_viewer_members
  )
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.objectAdmin"
  member = each.value

  condition {
    title       = "AllowTerraformLockFilesOnly"
    description = "Allow only *.tflock operations for Terraform state locking"
    # resource.name は "projects/_/buckets/BUCKET/objects/OBJECT" 形式
    expression = "resource.name.startsWith(\"projects/_/buckets/${google_storage_bucket.tfstate.name}/objects/\") && resource.name.endsWith(\".tflock\")"
  }
}
