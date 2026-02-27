# infra/environments/prod/apps/web/wif.tf

# ------------------------------------------------------------
# Workload Identity Federation（WIF）
# - GitHub Actionsなどのワークロードが、サービスアカウントキーを使用せずアクセス可能
# 1) GitHub ActionsのOIDCの許可条件を保管する場所を作成
# 2) GitHub ActionsのOIDCの許可条件を作成
# ------------------------------------------------------------

resource "google_iam_workload_identity_pool" "github" {
  # github_repositoryが空なら作らない
  count                     = var.github_repository != "" ? 1 : 0
  project                   = var.project_id
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions Pool"
  description               = "WIF pool for GitHub Actions"
  disabled                  = false

  lifecycle {
    # 誤削除防止（本番はtrue推奨）
    prevent_destroy = true
  }

  depends_on = [
    google_project_service.apis["iam.googleapis.com"],
  ]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  # github_repositoryが空なら作らない
  count                              = var.github_repository != "" ? 1 : 0
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub Actions Provider"
  description                        = "OIDC provider for GitHub Actions"
  disabled                           = false

  lifecycle {
    # 誤削除防止（本番はtrue推奨）
    prevent_destroy = true
  }

  # OIDC（OpenID Connect：OAuth 2.0をベースにした認証・連携）トークン認証局をGitHubに設定
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  # GitHubからの情報をマッピング
  attribute_mapping = {
    # 操作実行環境の識別子
    "google.subject"       = "assertion.sub"
    # リポジトリ名
    "attribute.repository" = "assertion.repository"
    # ブランチやタグ名
    "attribute.ref"        = "assertion.ref"
    # 操作実行者（GitHubユーザー名）
    "attribute.actor"      = "assertion.actor"
    # ジョブのワークフロー名
    "attribute.job_workflow_ref" = "assertion.job_workflow_ref"
    # アクセス元のref種別を分類
    # refs/pull/xxx/mergeなら「pr」
    # var.github_allowed_refなら「main」
    # それ以外は「other」
    "attribute.access" = "assertion.ref.startsWith(\"refs/pull/\") ? \"pr\" : (assertion.ref == \"${var.github_allowed_ref}\" ? \"main\" : \"other\")"
  }

  # 許可するGitHubリポジトリかつ、ref種別がmain＆prが操作元なら許可
  attribute_condition = "attribute.repository == \"${var.github_repository}\" && (attribute.access == \"main\" || attribute.access == \"pr\")"
}

# ------------------------------------------------------------
# Workload Identity Federation（WIF）に必要な権限を付与
# 1) GitHub Actionsからの閲覧用サービスアカウントを利用する権限（ref種別がprのみ）
# 2) GitHub Actionsからのデプロイ用サービスアカウントを利用する権限（ref種別がmainのみ）
# 3) GitHub ActionsからのTerraform実行用サービスアカウントを利用する権限（ref種別がprのみ）
# ------------------------------------------------------------

resource "google_service_account_iam_member" "wif_impersonate_github_terraform_viewer" {
  # github_repositoryが空なら作らない
  count              = var.github_repository != "" ? 1 : 0
  # GitHub ActionsからのTerraform閲覧用サービスアカウント
  service_account_id = google_service_account.github_terraform_viewer.name
  role               = "roles/iam.workloadIdentityUser"
  # ref種別がprのみに権限を付与
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.access/pr"
}

resource "google_service_account_iam_member" "wif_impersonate_github_deployer" {
  # github_repositoryが空なら作らない
  count              = var.github_repository != "" ? 1 : 0
  # GitHub Actionsからのデプロイ用サービスアカウント
  service_account_id = google_service_account.github_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  # ref種別がmainのみに権限を付与
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.access/main"
}

resource "google_service_account_iam_member" "wif_impersonate_github_terraform" {
  # github_repositoryが空なら0個、そうでなければ2個作る
  for_each = var.github_repository != "" ? {
    # ref種別がprおよびmainのみに権限を付与
    pr   = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.access/pr"
    main = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.access/main"
  } : {}
  # GitHub ActionsからのTerraform実行用サービスアカウント
  service_account_id = google_service_account.github_terraform_runner.name
  role               = "roles/iam.workloadIdentityUser"
  member             = each.value
}
