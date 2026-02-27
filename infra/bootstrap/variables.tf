# infra/bootstrap/variables.tf

variable "project_id" {
  type        = string
  description = "tfstateバケットを作るGCPプロジェクトID（例: coffee-ai-mentor-bootstrap）"
}

variable "state_bucket_name" {
  type        = string
  description = "Terraform state用の一意のGCSバケット名（例: coffee-ai-mentor-bootstrap-tfstate-us-central1）"
}

variable "location" {
  type        = string
  description = "バケットのロケーション。 (例: us-central1）"
  default     = "us-central1"
}

variable "storage_class" {
  type        = string
  description = "バケットのストレージクラス"
  default     = "STANDARD"
  validation {
    condition     = var.storage_class == "STANDARD"
    error_message = "無料枠前提のため、storage_classはSTANDARDのみ許可します。"
  }
}

variable "max_archived_versions_to_keep" {
  type        = number
  description = "Object Versioningにより増えるアーカイブを何個残すか（世代数で管理）"
  default     = 20
}

variable "bucket_admin_members" {
  type        = set(string)
  description = "バケット管理者（break-glass用）"
  validation {
    condition     = length(var.bucket_admin_members) > 0
    error_message = "bucket_admin_membersは最低1つ指定してください（break-glass管理者）。"
  }
}

# GitHub ActionsのTerraform実行用サービスアカウント以外にも必要であれば指定
variable "bucket_object_admin_members" {
  type        = set(string)
  description = "バケットのオブジェクト管理者（Terraform実行者）"
  default     = []
}

# GitHub ActionsのTerraform閲覧用サービスアカウント以外にも必要であれば指定
variable "bucket_object_viewer_members" {
  type        = set(string)
  description = "バケットのオブジェクト閲覧者（Terraform閲覧者）"
  default     = []
}
