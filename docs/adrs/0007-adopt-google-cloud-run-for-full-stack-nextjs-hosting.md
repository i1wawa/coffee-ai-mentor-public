<!-- docs/adrs/0007-adopt-google-cloud-run-for-full-stack-nextjs-hosting.md -->

# Adopt Google Cloud Run for Full-Stack Next.js Hosting

## Context and Problem Statement

本 ADR は、既に採用済みである Google Cloud Run のホスティング判断を事後的に記録するものである。

本システムは、Next.js App Router を用いたフルスタック Web アプリケーションであり、以下の性質を持つ。

- Node.js サーバーとして SSR（Server-Side Rendering）、Route Handler、Server Actions を扱う
- 外部 API をサーバー側から利用する
- 実行時シークレットを安全に扱う必要がある
- Docker コンテナでローカル開発、本番実行、将来の分割をそろえたい
- 将来的に IaC（Infrastructure as Code）、CI/CD、監視、ログ収集まで含めて運用を整えたい

この段階では、まず 1 つのサービスとして価値検証を進めつつ、後から責務分離しやすいホスティング先を選ぶ必要がある。

候補としては、Cloud Run、Cloudflare Workers、Vercel Hobby、Render Free、Firebase App Hosting がある。どれも無料または低コストで開始できるが、実行モデル、Node.js 互換性、シークレット管理、将来の運用設計に差がある。

本 ADR では、初期のアプリホスティング先として何を採用するかを決定する。

## Decision Drivers

- 無料または低コストで開始しやすく、初期のコスト予測がしやすいこと
- Next.js のフルスタック機能を Node.js サーバーとして素直に動かせること
- 実行時シークレットや認証情報を安全に扱いやすいこと
- Docker コンテナを前提に、ローカル開発と本番実行の差分を小さくできること
- 将来の IaC、CI/CD、ログ、監視、サービス分割へ伸ばしやすいこと

## Considered Options

- Option A: Cloud Run を採用する
- Option B: Cloudflare Workers を採用する
- Option C: Vercel Hobby を採用する
- Option D: Render Free を採用する
- Option E: Firebase App Hosting を採用する

## Considered Options Pros and Cons Table

- Option A
  - Pros
    - Next.js を Node.js サーバーまたは Docker コンテナとして、そのまま動かしやすい
    - Secret Manager、Cloud Logging、Artifact Registry、GitHub Actions、Terraform と接続しやすい
    - 初期は 1 サービスで始め、後から Web、AI API、Worker に分割しやすい
    - 無料枠と従量課金の考え方が比較的分かりやすい
  - Cons
    - Next.js 特化の開発体験は Vercel より薄い
    - edge 実行前提の超低レイテンシ構成は Workers より不得意
    - コールドスタートやコンテナ運用を意識する必要がある

- Option B
  - Pros
    - 無料枠が強く、軽量 API や edge 配信との相性が良い
    - CDN と近い位置で低レイテンシを狙いやすい
  - Cons
    - Workers Runtime は通常の Node.js サーバーと実行モデルが異なる
    - 依存ライブラリや周辺ツールで互換性確認が必要になりやすい
    - RAG や文書取り込みが増えると、HTTP リクエスト内で完結する処理だけでは収まりにくくなり、  
      受け付け用の Web API と非同期実行用の Queue/Worker を分ける設計になりやすい

- Option C
  - Pros
    - Next.js との統合が最も強く、初期セットアップとデプロイ体験が良い
    - Preview deployment など開発体験が優れている
  - Cons
    - 無料枠が複数の指標に分かれており、AI API を含むサーバー処理のコスト感を読みづらい
    - インフラの主導権やランタイム前提を自分で握りにくい
    - 将来の構成変更で実行基盤を明示的に管理したくなったときの移行検討が必要になる

- Option D
  - Pros
    - 無料で試しやすく、一般的な Node アプリを載せやすい
    - サービスの概念が分かりやすい
  - Cons
    - 無通信時のスピンダウンがあり、初回応答遅延が出やすい
    - 本番利用前提の安定性や快適性では制約が大きい
    - 将来の運用基盤としては Cloud Run より拡張しにくい

- Option E
  - Pros
    - Firebase 連携を前提にしたデプロイ体験を得やすい
    - Cloud Run ベースのため、Next.js フルスタック構成との相性は良い
  - Cons
    - Blaze プラン前提で、無料枠最優先の判断軸とは少しずれる
    - 実体が複数の Google Cloud サービスにまたがるため、コストや構成の理解が一段増える
    - Cloud Run を直接扱うより、基盤理解の透明性が下がる

## Decision Outcome

- Chosen option: Option A
  - Reasons:
    - 本システムは Next.js のフルスタック機能と Node.js サーバー互換性を重視しており、Cloud Run は Docker コンテナでそのまま載せやすい
    - 外部 API、DB 接続、実行時シークレット管理を、一般的なサーバーアプリの考え方で扱いやすい
    - Secret Manager、Cloud Logging、Terraform、GitHub Actions を組み合わせた運用へ自然に拡張できる
    - 初期は 1 サービスで価値検証を進めつつ、将来は Cloud Run サービス単位で責務分離しやすい
    - 無料または低コストで開始しやすく、初期フェーズではコスト感覚を掴みやすい

初期の本番ホスティングとして Google Cloud Run を採用する。

初期構成では、Next.js アプリを 1 つの Cloud Run サービスとして運用する。将来、AI 処理、RAG（Retrieval-Augmented Generation）、文書取り込み、非同期ジョブが増えた場合は、AI API や Worker を別サービスへ分離する前提で設計する。

## Positive Consequences

- Next.js を Node.js サーバーとして素直に運用でき、実装上の回り道が少ない
- Docker ベースでローカル開発と本番実行の差分を抑えやすい
- 実行時シークレット、ログ、監視、デプロイ基盤を Google Cloud 上で整理しやすい
- 初期は単純な構成で始めつつ、負荷特性に応じて後からサービス分割しやすい

## Negative Consequences

- Vercel と比べると、Next.js 専用の DX（Developer Experience）は弱い
- Cloudflare Workers と比べると、edge 実行前提の低レイテンシ構成では不利になり得る
- コンテナ起動時間や同時実行設定など、運用時に Cloud Run 固有の調整が必要になる
- AI 処理や RAG が重くなった場合でも、1 サービス構成を引き延ばしすぎると責務分離が遅れる

## Relations

- https://cloud.google.com/run/pricing
- https://cloud.google.com/run/docs/quickstarts/frameworks/deploy-nextjs-service
- https://nextjs.org/docs/app/getting-started/deploying
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- https://vercel.com/docs/plans/hobby
- https://render.com/docs/free
- https://firebase.google.com/docs/app-hosting/costs
- https://railway.com/pricing
