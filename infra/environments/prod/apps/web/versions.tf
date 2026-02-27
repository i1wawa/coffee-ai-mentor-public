terraform {
  # 再現性のため、パッチ更新のみ許容（bootstrapと揃える）
  required_version = "~> 1.14.0"

  required_providers {
    # Google Cloud
    google = {
      source  = "hashicorp/google"
      version = "~> 7.14"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.14"
    }

    # Sentry
    sentry = {
      source  = "jianyuan/sentry"
      version = "~> 0.14.0"
    }
  }
}
