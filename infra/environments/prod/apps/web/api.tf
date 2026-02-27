# infra/environments/prod/apps/web/api.tf

# ------------------------------------------------------------
# API
# ------------------------------------------------------------

resource "google_project_service" "apis" {
  for_each = local.required_apis
  project  = var.project_id
  service  = each.value
  # リソース削除時にもAPI自体は無効化されないように
  disable_on_destroy = false
}
