<!-- docs/adrs/0003-adopt-hybrid-secret-management-for-ci-cd-and-cloud-run.md -->

# Adopt Hybrid Secret Management for CI/CD and Cloud Run

## Context and Problem Statement

本リポジトリは以下の構成を持つ。

- IaC（Infrastructure as Code）: Terraform
  - infra/bootstrap（基盤ブートストラップ）
  - infra/environments/prod/apps/web（本番アプリ基盤）
- CD（Continuous Deployment）
  - GitHub Actions で Docker build -> Artifact Registry push -> Cloud Run deploy
- CI認証
  - GitHub Actions から GCP へ WIF（Workload Identity Federation）/OIDC（OpenID Connect）でキーレス認証
- 実行時シークレット
  - Cloud Run から Secret Manager を参照して注入

扱う値は性質が異なる。

- ビルド時:
  - クライアントへ埋め込まれる公開変数（Next.jsの NEXT_PUBLIC_*）
- 実行時:
  - 必要なシークレット（DATABASE_URL, GEMINI_API_KEY など）
  - 実行時の非シークレット設定（SERVICE_NAME, APP_ENV など）
- CI実行時:
  - 必要なシークレット（Terraformの外部プロバイダ用トークン等）
  - Terraformの変数（TF_VAR_*）やプロバイダ向け環境変数

これらを混在させると、以下の問題が起きる。

- Docker build（ビルド時）にシークレットを渡すと、イメージ層、ビルドログ、キャッシュ、履歴に残るリスクが高い
- Terraform state に秘匿値が入ると、state保管先の権限と監査が難しくなり、漏えい範囲が広がる
- GitHub Actions に全てのシークレットを置くと、棚卸し、ローテーション、監査が分散し、長期的に破綻しやすい
- Cloud Run の設定を Terraform 管理しているのに、CD 側で --set-env-vars を多用するとドリフトが起きやすい
- PR（pull_request）で prod 相当のシークレットを使うと、意図せず外部送信やログ露出の事故が起きる可能性がある

そのため、何をどこに置き、どの経路で注入するかのルールを明確にする。

## Decision Drivers

- セキュリティ（漏えい経路の最小化、最小権限、鍵レス、ビルド時秘匿値混入の回避）
- 運用性（監査、ローテーション、棚卸し、環境分離、責務分離）
- 一貫性（TerraformとCDの責務境界の明確化、ドリフト最小化）
- 開発速度（ローカル開発のしやすさ、デプロイの単純さ、トラブルシュート容易性）

## Considered Options

- Option A: GitHub Actionsに全てのSecrets/Varsを集約し、CIからCloud Runへも注入する
- Option B: Secret Managerに全てのSecrets/Varsを集約し、GitHub Actionsは参照のみにする
- Option C: ハイブリッド運用（実行時SecretsはSecret Manager、CI専用SecretsはGitHub、公開/非秘匿のVarsはGitHub）

## Considered Options Pros and Cons Table

- Option A
  - Pros
    - GitHub内で完結し、設定箇所が少ない
    - CIの実装が単純になりやすい
  - Cons
    - SecretsがGitHubに常置され、監査とローテーションが分散しやすい
    - Cloud Run実行時SecretsまでCI経由で注入すると漏えい経路が増える
    - CDの責務が肥大化し、設定変更が雑になりやすい

- Option B
  - Pros
    - Secrets/Varsの集中管理（監査、ローテ、棚卸し）がしやすい
    - GitHub側の保持情報を最小化できる
  - Cons
    - 公開変数（NEXT_PUBLIC_*）までSecret Managerで管理すると、ビルド時注入の仕組みが煩雑になる
    - CI専用Secrets（外部プロバイダ用トークン等）までGCP側に寄せると、管理責務が過度にGCPへ偏る

- Option C
  - Pros
    - 実行時SecretsはSecret Managerで集中管理しつつ、CI専用SecretsはGitHubで最小範囲に限定できる
    - Docker buildにSecretsを入れない設計を徹底できる
  - Cons
    - 保管場所が2系統になり、分類ルールが曖昧だと迷いやすい
    - PRのTerraform plan運用など、環境ゲート設計を誤ると漏えいリスクが残る
    - Secret Manager側のIAM設計と運用手順が必要になる

## Decision Outcome

- Chosen option: Option C
  - Reasons:
    - 実行時SecretsはSecret Managerに集約し、Cloud Runが直接参照して注入することで、CI経由の漏えい経路を減らせる
    - CI専用SecretsはGitHub Environments secretsに限定し、stepスコープでのみ注入することで露出範囲を最小化できる

以下を本ADRのルールとして採用する。

1. 分類ルール（どこに置くか）

- Secret Managerに置くもの（実行時Secrets）
  - Cloud Runの実行時に必要な秘匿値
  - 将来、CIでDBマイグレーション等を行う場合のDB接続情報も、GitHubではなくSecret Managerから取得する

- GitHub Actions（GitHub Environments）に置くもの
  - Vars（非シークレット、または公開可能な設定値）
  - Secrets（CI専用Secrets）

- リポジトリに置かないもの
  - 本番/検証環境の秘匿値を .env に置かない（ローカル専用）
  - DockerfileのARG/ENVに実シークレットを埋め込まない
  - Terraformコードに秘匿値を直書きしない（stateに残るため）

## Positive Consequences

- 実行時SecretsはSecret Managerに集中し、監査・ローテーション・棚卸しがしやすくなる
- CIは鍵レス（WIF/OIDC）で運用でき、長期鍵漏えいリスクを低減できる
- Docker buildにSecretsを入れないルールが明確になり、イメージ層やキャッシュへの混入事故を防げる

## Negative Consequences

- GitHubとGCPの2系統で管理するため、分類ルールを破ると混乱が発生する
- Secret Manager側のIAM設計と運用手順（誰が値を投入し、どう回すか）が必要になる
- PR planやtfplan artifactなど、運用ルールを怠ると残存リスクが残る

## Relations

- .github/workflows/terraform-prod-apps-web.yml
- .github/workflows/terraform-bootstrap.yml
- .github/workflows/nextjs-to-cloudrun-deploy.yml
- infra/environments/prod/apps/web/cloud_run.tf
- apps/web/Dockerfile
