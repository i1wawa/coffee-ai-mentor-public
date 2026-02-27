terraform {
  # 再現性のため、パッチ更新のみ許容
  required_version = "~> 1.14.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      # 再現性のため、パッチ更新のみ許容
      version = "~> 7.14"
    }
  }
}
