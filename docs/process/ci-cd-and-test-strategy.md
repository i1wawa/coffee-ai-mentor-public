# Coffee AI Mentor - CI/CD and Test Strategy

- [1. テスト戦略](#1-テスト戦略)
  - [1.1 機能テスト方針](#11-機能テスト方針)
  - [1.2 非機能テスト方針](#12-非機能テスト方針)
- [2. CI/CD・リリース戦略](#2-cicdリリース戦略)
  - [2.1 リリース作業](#21-リリース作業)
  - [2.2 CI/CDパイプライン](#22-cicdパイプライン)
- [3. インフラ構成管理](#3-インフラ構成管理)
- [4. ブランチ戦略](#4-ブランチ戦略)
  - [4.1 ブランチ名・コミットメッセージ規則](#41-ブランチ名コミットメッセージ規則)

## 1. テスト戦略

- 不正やエラー、ダウンの原因追跡に役立つテストのみ残す

### 1.1 機能テスト方針

- 実施比率（テストピラミッド）：単体テスト（約80%）＞ サービス・統合テスト（約20%） ＞ E2E（10本以下）
- 単体テスト：純粋ロジックの分岐・例外・境界値をテスト（時刻・乱数・DB・外部APIはテストダブル）
- サービステスト
  - バックエンド：ユースケースの主要経路・代表的失敗をテスト（DB・外部APIはテストダブル）
  - フロントエンド：画面単位の主要経路・代表的失敗をテスト（APIはテストダブル）
- 統合テスト
  - バックエンド：API→DBの正常系・ロールバックをテスト（外部APIはテストダブル）
  - フロントエンド：UI→APIの正常系・ロールバックをテスト（外部APIはテストダブル）
- E2E：最重要シナリオの正常系・致命的失敗を実ブラウザ・本番同等経路でテスト

### 1.2 非機能テスト方針

※未実施

- 負荷テスト
  想定どおりのユーザー数・トラフィックでちゃんと動くか。
  例：通常時の同時接続1000人でレスポンスがどれぐらいか。

- ストレステスト
  想定以上の負荷をかけて、どこで壊れるのか・どう壊れるのかを見る。
  「限界性能」と「壊れ方」（フェイルの仕方）を確認。

- 耐久テスト
  中程度の負荷を長時間かけ続けて、メモリリークやリソース枯渇などを検出。

- スパイクテスト
  短時間に急激な負荷をかけて、スケール機構やバースト時の挙動を見る。

## 2. CI/CD・リリース戦略

- CI/CD戦略
  - 本番環境が常にデプロイ可能な状態に保つ
  - 1日に複数回デプロイしても苦にならない運用負荷
  - ビルド・テスト・デプロイをできる限り自動化
    - フィーチャーフラグを利用
  - 変更は小さく、短いフィードバックループで検証

- リリース戦略
  - DBマイグレーション：後方互換・ロールフォワードを基本とし、破壊的変更はExpand and Contractパターンを実行
  - （※必要なら）フィーチャーフラグ：`feature_flags`テーブルを`config/feature-flags.yaml`から更新
    - ロールバック：`git revert`（緊急時は直接DB操作）
  - 変更履歴：`CHANGELOG.md`を更新  
    （[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)を参考）
  - バージョニングタグ：Gitタグ（vX.Y.Z）は`package.json`の`version: X.Y.Z`と対応させて更新  
    （[Semantic Versioning](https://semver.org/lang/ja/)を参考）

### 2.1 リリース作業

1. PRマージ前

- 変更対象に以下を含める
  - フィーチャーフラグ：`config/feature-flags.yaml`を更新
  - 変更履歴：`CHANGELOG.md`を更新
  - バージョニング：`package.json`の`version: X.Y.Z`を更新  
    （[Semantic Versioning](https://semver.org/lang/ja/)を参考）
    - X：メジャーバージョン。後方互換性のない機能変更の場合に上げる
    - Y：マイナーバージョン。後方互換性のある機能追加の場合に上げる
    - Z：パッチバージョン。後方互換性のあるバグ修正をした場合に上げる

2. リリース後

- バージョニング：Gitタグ（vX.Y.Z）作成

### 2.2 CI/CDパイプライン

- `main`ブランチへのPR時  
  （該当アプリ・CI設定・依存関係への影響があるとき）
  1. コードスタイル・静的解析
  2. 単体テスト～E2Eテストによる検証

- `main`ブランチへのpush時  
  （該当アプリ・CI設定・依存関係への影響があるとき）
  1. コードスタイル・静的解析
  2. 単体テスト～E2Eテストによる検証
  3. Next.jsのビルド実行
  4. （※未実装）Prismaのスキーマ整合性チェック・マイグレーション  
     （マイグレーション失敗したら中断）
  5. コンテナイメージをビルドし、short SHAを付与
  6. 上記をGoogle Artifact Registryへpush
  7. 上記を本番環境のGoogle Cloud Runにトラフィックを0%でデプロイ
  8. ヘルスチェックがOKならトラフィックを100%に  
     （NGなら旧バージョンのまま）
  9. （※必要なら）`config/feature-flags.yaml`を読み取り反映する

## 3. インフラ構成管理

- Terraformでコード化して残す
  - Terraformの状態はGoogle Cloud Storageバケットに保存（状態共有・競合防止・アクセス制御・バージョニングのため）
- コンテナイメージはGoogle Cloud Artifact Registryに保管
  - イメージは最新2件のみ残す
  - Cloud Runのコンテナイメージ更新はGitHub Actionsで行い、Terraformは基盤設定を担う
- Terraformに必要なSecretsはGitHub Actions Environment secretsに保管
  - アプリ本体に必要なSecretsはGoogle Cloud Secret Managerに保管

## 4. ブランチ戦略

- [GitHubフロー](https://docs.github.com/ja/get-started/using-github/github-flow)を参考
  - 個別のブランチを作成
- 本番環境用ブランチ`main`を常にデプロイ可能状態に保つ
- ステージング環境検証は、Google Cloud Runのプロジェクトを切り替えてから、通常どおり`main`へpush
- 開発時はローカルPCのDockerコンテナで検証
- マージはリベースマージかスクワッシュで履歴をきれいに

### 4.1 ブランチ名・コミットメッセージ規則

- ラベル：[Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/)を参考
- ブランチ名：`<ラベル>(<スコープ>)/<issue番号>-<概要（kebab-case）>`  
  （revertブランチ：`<ラベル>(<スコープ>)/<issue番号>-of-<revert対象のissue番号>-<revert対象の概要（kebab-case）>`）  
  ※(<スコープ>)は任意
- コミットメッセージ：`<ラベル>(<スコープ>): <概要（日本語）>`  
  ※(<スコープ>)は任意

  <!-- prettier-ignore -->
  | 目的          | ラベル      | ブランチ名例                       | コミットメッセージ例                  |
  | ------------- | ---------- | ------------------------------- | ---------------------------------- |
  | 調査          | `spike`    |                 -                |                  -                 |
  | 新機能        | `feat`     | `feat(table)/123-table-filter`   | `feat(table): テーブルフィルタを追加`  |
  | バグ修正      | `fix`      | `fix/123-login-timeout`          | `fix: サインインタイムアウトを修正`       |
  | コード整形     | `style`   | `style/123-format`               | `style: プリッター実行`               |
  | ドキュメント   | `docs`     | `docs/123-readme-a11y`           | `docs: README.mdにa11yを追加`       |
  | リファクタ    | `refactor` | `refactor/123-form-hooks`        | `refactor: フォームフックを分割`       |
  | パフォーマンス | `perf`     | `perf/123-virtual-scroll`        | `perf: 仮想スクロールを導入`           |
  | テスト        | `test`     | `test/123-e2e-flows`             | `test: チェックアウトのe2eを追加`      |
  | 雑務         | `chore`    | `chore/123-repo-cleanup`         | `chore: Issueテンプレートを追加`       |
  | 依存/ビルド   | `build`    | `build/123-deps-update`          | `build: tanstack-queryをアップデート` |
  | CI          | `ci`        | `ci/123-cache-node-modules`      | `ci: pnpmのキャッシュストアを追加`     |
  | 取り消し      | `revert`   | `revert/456-of-123-table-filter` | `revert: feat: テーブルフィルタを追加` |
