# Changelog

> 2026-02-27 以前の詳細な開発履歴は非公開リポジトリで管理しています。

<!--

以下を参考
・Keep a Changelog 1.1.0: https://keepachangelog.com/ja/1.1.0/
・Semantic Versioning: https://semver.org/lang/ja/

・セクション
  ・リリース前: `## [Unreleased]`
  ・リリース時: `## [x.y.z] - yyyy-mm-dd`
    （リリース時には、リリース前の変更点をすべて移動）

・変更の種類
Added       新機能について。
Changed     既存機能の変更について。
Deprecated  間もなく削除される機能について。
Removed     今回で削除された機能について。
Fixed       不具合修正について。
Security    脆弱性に関する場合。

-->

## [Unreleased]

### Added

- 認証機能を導入（内部 issue #28）
  - サインイン・サインアウト（単端末/全端末）・セッション確認・アカウント削除機能を追加

- オブザーバビリティ基盤を導入し、サービスの可観測性を強化（内部 issue #30）
  - Sentryを導入し、死活監視・エラー監視を開始
  - Cloud Loggingを導入し、リクエスト単位でのログ出力を開始

- CI/CDパイプラインを最小構成で構築（内部 issue #29）
  - Prettier・Biomeでのリンター・フォーマッターを追加し、コード品質とレビュー体験の基盤を構築
  - Vitestでの単体テスト・PlaywrightでのE2Eテストを追加し、コード変更時の安全性の基盤を確保
  - デプロイ用のDockerコンテナ構成およびビルド設定を追加し、実行環境の再現性を確保
  - GitHub Actions設定を追加し、常にデプロイ可能な状態を保持
  - TerraformでCloud Run設定を追加し、インフラ構成の再現性を確保

- 個人利用（dogfooding）段階向けのアーキテクチャ設計ドキュメント群を追加し、
  実装判断の基準を明文化（内部 issue #25）
  - [アーキテクチャ概要](docs/architecture/architecture-overview.md)
  - [ディレクトリ構成](docs/architecture/project-structure.md)
  - [画面遷移・画面構成概要](docs/architecture/ui-rendering-and-state.md)
  - [ドメイン・データモデル](docs/architecture/domain-and-data-model.md)
  - [CI/CD・テスト戦略](docs/process/ci-cd-and-test-strategy.md)
  - [横断的関心事](docs/architecture/cross-cutting-concerns.md)

- Coffee AI Mentorのユーザーストーリーマップのバックボーンを追加し、
  技術選定や設計の土台となるユーザー体験を整理（内部 issue #23）

- Coffee AI Mentorのプロダクトビジョン・問題定義書と、
  dogfoodingフェーズのプロダクト要件定義書（目的・KPI・スコープなど）を追加し、
  開発の目的や範囲、数値目標を明確化（内部 issue #21）

- CONTRIBUTING.mdを新規追加し、開発フローを明文化（内部 issue #9）

- CHANGELOG.mdを新規追加し、変更履歴管理を標準化（内部 issue #9）

[Unreleased]: https://github.com/i1wawa/coffee-ai-mentor-public/compare/v0.0.0...HEAD
