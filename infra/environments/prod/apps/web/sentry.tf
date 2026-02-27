# infra/environments/prod/apps/web/sentry.tf

# ------------------------------------------------------------
# Team
# ------------------------------------------------------------

resource "sentry_team" "coffee_ai_mentor" {
  organization = var.organization
  name         = var.team
  slug         = var.team
}

# ------------------------------------------------------------
# Project
# ------------------------------------------------------------

resource "sentry_project" "web" {
  organization = var.organization
  teams        = [sentry_team.coffee_ai_mentor.slug]

  name = var.project_id
  slug = var.project_id

  # SentryをNext.jsに最適化
  platform = "javascript-nextjs"

  # Data Source Name（DSNキー）は以下で作るため無効化
  default_key = false

  # ルールはTerraformで作るため無効化
  default_rules = false
}

# ------------------------------------------------------------
# Data Source Name（DSNキー）
# ------------------------------------------------------------

resource "sentry_key" "web_dsn" {
  organization = var.organization
  project      = sentry_project.web.slug
  name         = "web_dsn"
}

# ------------------------------------------------------------
# Uptime Monitor
# - /api/healthが3回連続失敗で通知
# ------------------------------------------------------------

# ※Sentry社によって公式にスポンサー・サポートされているjianyuan/sentryにないため、UIで設定必須

# ------------------------------------------------------------
# Issue Alert:
# - error以上の新規エラー（新しいIssueが作られる）を通知
# ------------------------------------------------------------

resource "sentry_issue_alert" "prod_new_error_or_higher" {
  organization = var.organization
  project      = sentry_project.web.slug

  name        = "prod: new error+ (first seen)"
  # ドキュメントと挙動が違う（sentry_team.coffee_ai_mentor.idを入れると、internal_idが返ってきてしまう）
  owner       = "team:${sentry_team.coffee_ai_mentor.internal_id}"
  environment = var.environment

  # 通知の頻度（1度通知したあと5分間は通知しない）
  frequency    = 5
  # すべての条件を満たしたときにアクションを実行
  action_match = "all"
  # すべてのフィルターを満たしたときにアクションを実行
  filter_match = "all"

  # 新しいIssueが作られたときをトリガーに
  conditions_v2 = [
    { first_seen_event = {} }
  ]

  # event level >= errorをトリガーに
  filters_v2 = [
    {
      level = {
        match = "GREATER_OR_EQUAL"
        level = "error"
      }
    }
  ]

  # Teamのメンバー全員にメール通知
  actions_v2 = [
    {
      notify_email = {
        target_type       = "Team"
        target_identifier = sentry_team.coffee_ai_mentor.internal_id
        # ドキュメントと挙動が違う（"AllMembers"を入れてもNullになる）
        # fallthrough_type  = "AllMembers"
      }
    }
  ]
}

# ------------------------------------------------------------
# Issue Alert:
# - 3回連続失敗で通知
# ------------------------------------------------------------

resource "sentry_issue_alert" "prod_uptime_outage" {
  organization = var.organization
  project      = sentry_project.web.slug

  name        = "prod: uptime outage"
  owner       = "team:${sentry_team.coffee_ai_mentor.internal_id}"
  environment = var.environment

  # 通知の頻度（1度通知したあと5分間は通知しない）
  frequency    = 5
  # いずれかの条件を満たしたときにアクションを実行
  action_match = "any"
  # すべてのフィルターを満たしたときにアクションを実行
  filter_match = "all"

  # トリガー条件（新規発生時と、修正後の再発時）
  conditions_v2 = [
    {
      first_seen_event = {}
    },
    {
      regression_event = {}
    }
  ]

  # Uptime Monitoringが3回連続失敗をトリガーに
  filters_v2 = [
    { issue_category = { value = "Outage" } }
  ]

  # Teamのメンバー全員にメール通知
  actions_v2 = [
    {
      notify_email = {
        target_type       = "Team"
        target_identifier = sentry_team.coffee_ai_mentor.internal_id
        # ドキュメントと挙動が違う（"AllMembers"を入れてもNullになる）
        # fallthrough_type  = "AllMembers"
      }
    }
  ]
}
