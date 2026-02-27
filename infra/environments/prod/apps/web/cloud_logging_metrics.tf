# infra/environments/prod/apps/web/cloud_logging_metrics.tf

locals {
  # 該当するCloud Runのログだけに絞る共通フィルタ
  cloud_run_log_filter = join(" AND ", [
    # Cloud Runのリビジョン由来のログだけに絞る
    "resource.type=\"cloud_run_revision\"",
    # 特定のサービス・リージョンに絞る
    "resource.labels.service_name=\"${var.service_name}\"",
    # リージョンも絞る
    "resource.labels.location=\"${var.region}\"",
  ])

  # 外部依存境界ログに絞る共通フィルタ
  dependency_call_log_filter = join(" AND ", [
    local.cloud_run_log_filter,
    "jsonPayload.event=\"dependency.call\"",
  ])
}

# ------------------------------------------------------------
# Google Cloud Loggingのログベースの指標を定義
# - 外部依存境界ログをカウント
# ------------------------------------------------------------

resource "google_logging_metric" "dependency_calls" {
  name        = "coffee_ai_mentor/dependency_calls"
  description = "External dependency call count (dependency.call; from app structured logs)."
  project     = var.project_id

  # 該当するログに絞る
  filter = join(" AND ", [
    # 外部依存境界ログに絞る共通フィルタ
    local.dependency_call_log_filter,
    # 外部依存識別子
    "jsonPayload.dependency:*",
    # 依存先で実行した操作種別
    "jsonPayload.operation:*",
    # 成功/失敗フラグ
    "jsonPayload.ok:*",
  ])

  # 指標の詳細設定
  metric_descriptor {
    # 変化量を記録
    metric_kind  = "DELTA"
    # 整数値でカウント
    value_type   = "INT64"
    display_name = "Dependency calls"

    labels {
      key         = "dependency"
      value_type  = "STRING"
      description = "Dependency name (e.g., llm.gemini, db.supabase, mail.resend)"
    }
    labels {
      key         = "operation"
      value_type  = "STRING"
      description = "Operation (e.g., generate, insert, send_email, verify_token)"
    }
  }

  # ラベルを指定
  label_extractors = {
    # dependencyラベルを抽出
    "dependency" = "EXTRACT(jsonPayload.dependency)"
    "operation"  = "EXTRACT(jsonPayload.operation)"
  }

  depends_on = [
    google_project_service.apis["logging.googleapis.com"],
  ]
}

# ------------------------------------------------------------
# Google Cloud Loggingのログベースの指標を定義
# - 外部依存境界ログの異常系をカウント
# ------------------------------------------------------------

resource "google_logging_metric" "dependency_errors" {
  name        = "coffee_ai_mentor/dependency_errors"
  description = "External dependency error count (dependency.call, ok=false; from app structured logs)."
  project     = var.project_id

  # 該当するログに絞る
  filter = join(" AND ", [
    # 外部依存境界ログに絞る共通フィルタ
    local.dependency_call_log_filter,
    # 外部依存識別子
    "jsonPayload.dependency:*",
    # 依存先で実行した操作種別
    "jsonPayload.operation:*",
    # 失敗フラグ
    "jsonPayload.ok=false",
    # 短いエラー分類名
    "jsonPayload.error_class:*",
  ])

  # 指標の詳細設定
  metric_descriptor {
    # 変化量を記録
    metric_kind  = "DELTA"
    # 整数値でカウント
    value_type   = "INT64"
    display_name = "Dependency errors"

    labels {
      key         = "dependency"
      value_type  = "STRING"
      description = "Dependency name (e.g., llm.gemini, db.supabase, mail.resend)"
    }
    labels {
      key         = "operation"
      value_type  = "STRING"
      description = "Operation (e.g., generate, insert, send_email, verify_token)"
    }
    labels {
      key         = "error_class"
      value_type  = "STRING"
      description = "Error class (e.g., timeout, rate_limited, upstream_5xx, network_error)"
    }
  }

  # ラベルを指定
  label_extractors = {
    "dependency"  = "EXTRACT(jsonPayload.dependency)"
    "operation"   = "EXTRACT(jsonPayload.operation)"
    "error_class" = "EXTRACT(jsonPayload.error_class)"
  }

  depends_on = [
    google_project_service.apis["logging.googleapis.com"],
  ]
}

# ------------------------------------------------------------
# Google Cloud Loggingのログベースの指標を定義
# - 外部依存境界ログのレイテンシをヒストグラムで記録
# ------------------------------------------------------------

resource "google_logging_metric" "dependency_latency_ms" {
  name        = "coffee_ai_mentor/dependency_latency_ms"
  description = "External dependency latency in ms (distribution; dependency.call; from app structured logs)."
  project     = var.project_id

  # 該当するログに絞る
  filter = join(" AND ", [
    # 外部依存境界ログに絞る共通フィルタ
    local.dependency_call_log_filter,
    # 外部依存識別子
    "jsonPayload.dependency:*",
    # 依存先で実行した操作種別
    "jsonPayload.operation:*",
    # 所要時間（ms）
    "jsonPayload.latency_ms:*",
  ])

  # 指標の詳細設定
  metric_descriptor {
    # 変化量を記録
    metric_kind  = "DELTA"
    # ヒストグラムで記録
    value_type   = "DISTRIBUTION"
    unit         = "ms"
    display_name = "Dependency latency (ms)"

    labels {
      key         = "dependency"
      value_type  = "STRING"
      description = "Dependency name (e.g., llm.gemini, db.supabase, mail.resend)"
    }
    labels {
      key         = "operation"
      value_type  = "STRING"
      description = "Operation (e.g., generate, insert, send_email, verify_token)"
    }
  }

  # 記録する値を指定
  value_extractor = "EXTRACT(jsonPayload.latency_ms)"

  # ラベルを指定
  label_extractors = {
    dependency = "EXTRACT(jsonPayload.dependency)"
    operation  = "EXTRACT(jsonPayload.operation)"
  }

  # ヒストグラムの階級幅）
  bucket_options {
    exponential_buckets {
      # 階級数
      num_finite_buckets = 30
      # 階級幅の倍率（後ろにいくたびに1.5倍ずつ拡張）
      growth_factor      = 1.5
      # 最初の階級幅
      scale              = 10
    }
  }

  depends_on = [
    google_project_service.apis["logging.googleapis.com"],
  ]
}

# ------------------------------------------------------------
# Google Cloud Loggingのログベースの指標を定義
# - 外部依存境界ログのupstream_5xxエラーをカウント
# ------------------------------------------------------------

resource "google_logging_metric" "dependency_upstream_5xx_errors" {
  name        = "coffee_ai_mentor/dependency_upstream_5xx_errors"
  description = "External dependency upstream 5xx error count (dependency.call, error_class=upstream_5xx)."
  project     = var.project_id

  # 該当するログに絞る
  filter = join(" AND ", [
    # 外部依存境界ログに絞る共通フィルタ
    local.dependency_call_log_filter,
    # 外部依存識別子
    "jsonPayload.dependency:*",
    # 依存先で実行した操作種別
    "jsonPayload.operation:*",
    # 失敗フラグ
    "jsonPayload.ok=false",
    # エラー分類がupstream_5xxのものに限定
    "jsonPayload.error_class=\"upstream_5xx\"",
  ])

  # 指標の詳細設定
  metric_descriptor {
    # 変化量を記録
    metric_kind  = "DELTA"
    # 整数値でカウント
    value_type   = "INT64"
    display_name = "Dependency upstream 5xx errors"

    labels {
      key         = "dependency"
      value_type  = "STRING"
      description = "Dependency name (e.g., llm.gemini, db.supabase, mail.resend)"
    }
    labels {
      key         = "operation"
      value_type  = "STRING"
      description = "Operation (e.g., generate, insert, send_email, verify_token)"
    }
  }

  # ラベルを指定
  label_extractors = {
    dependency = "EXTRACT(jsonPayload.dependency)"
    operation  = "EXTRACT(jsonPayload.operation)"
  }

  depends_on = [
    google_project_service.apis["logging.googleapis.com"],
  ]
}
