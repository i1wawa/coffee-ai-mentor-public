# Coffee AI Mentor - Project Structure

- [1. 概要](#1-概要)
- [2. apps/web/ (Web UI・BFF・軽量API)](#2-appsweb-web-uibff軽量api)
  - [2.1 フロントエンド](#21-フロントエンド)
  - [2.2 ルーティング戦略](#22-ルーティング戦略)
  - [2.3 バックエンド](#23-バックエンド)
- [3. docs/ (開発規約・設計資料)](#3-docs-開発規約設計資料)

## 1. 概要

- モノリシック・リポジトリかつモジュラーモノリスで管理
- デプロイ単位でapps/を分割  
   (モバイル対応やバックエンド拡張を考慮)

  ```
  /               # root
    apps/         # デプロイ単位
      web/        # Next.js (Web UI・BFF・軽量API)
    packages/     # 共通モジュール
    contracts/    # API定義・DTO
    config/       # アプリケーション挙動設定 (フィーチャーフラグ・ABテスト設定など)
    infra/        # IaC・CI/CD設定
    docs/         # 開発規約・設計資料
  ```

## 2. apps/web/ (Web UI・BFF・軽量API)

- 使用フレームワーク：Next.js
  - 外部公開が不要な処理はRoute HandlerではなくServer Actionsを優先
  - フロントエンドとバックエンドを明確に分ける (将来バックエンドを分離できるように)
- テスト：単体テストは隣接 (xxx.tsに対してxxx.test.tsなど)、その他は専用ディレクトリに配置

  ```
  apps/web/
    src/
      app/             # Next.js App Router (UI・Route・Server Actions・BFF)
      frontend/        # フロントエンド
      backend/         # バックエンド
      tests/           # テストユーティリティ・E2Eテスト
        e2e/
        utils/         # Playwright/Vitest共通ユーティリティ
        vitest-utils/
  ```

### 2.1 フロントエンド

- [Feature-Sliced Design](https://feature-sliced.design/) (FSD)を参考
  - 依存方向：app/ -> `screens/ -> widgets/ -> features/ -> entities/ -> shared/`  
     (FSDでは最上層は`pages/`だが、Next.jsの旧ルーターとの混同を避けるため`screens/`とする)

  ```
  apps/web/src/frontend/
    screens/      # 画面を構成するUI群 (App Routerと連携)
      xxx/        # URL・ユーザージャーニー単位でディレクトリを切る

    widgets/      # 大きな自己完結UI (Header・Footerなど)
      xxx/        # ページを構成するセクション単位でディレクトリを切る

    features/     # ユースケース単位 (Login・Checkoutなど)
      xxx/        # ユースケース単位でディレクトリを切る
        ui/       # ボタン・フォーム・小さな表示
        model/    # Zustand/React Query/ロジック
        api/      # /api/brews 呼ぶ関数
        lib/      # その feature 固有のユーティリティ
        config/   # フラグ等

    entities/     # ドメインの最小単位 (User・Productなど)
      xxx/        # ドメイン単位でディレクトリを切る
        ui/       # そのドメインの見た目 (カード、行、バッジなど)
        model/    # 型、スキーマ、永続化用の shape
        api/      # そのエンティティを CRUD するAPI呼び出し

    shared/       # 横断ユーティリティ (UI・Lib・Clients・Config・Styles・Typesなど)
  ```

### 2.2 ルーティング戦略

- 認証チェックはレイアウトレベルで行い、未サインインかつセッションなしなら(auth)のサインインにリダイレクト。
- セッションは常に維持 (匿名でもサインインでも)

  ```
  apps/web/src/app/
    layout.tsx          # root layout
    (marketing)/        # マーケティング系の下位layout
    (app)/              # アプリ内部用の下位layout
    (auth)/             # 認証系の下位layout
    @modal/             # モーダル系のslot
  ```

### 2.3 バックエンド

- 以下を参考
  - [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture) (Hexa)  
     (ドメインが外部技術を知らなくて良いよう、外部技術を抽象と具体に分離し、技術換装を容易に)
  - [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (Clean)  
     (ドメインがフレームワーク・UI・外部技術に依存しないよう、レイヤー分離や依存方向の統一を行う)
  - [Domain-Driven Design](https://www.domainlanguage.com/ddd/reference/) (DDD)  
     (ドメインの概念構造とコードのモジュール構造を対応させ、ドメインの仕様変更とコードの変更箇所を揃えやすく)
  - [Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/)  
     (ユースケース単位でコードをまとめて完結させることを基本とし、機能の追加や変更を容易に)
- 入力の流れ：  
  外部 (UI・Webhook・バッチなど)  
  -> Inbound Adapter (具体的な内部関数呼び出し口)  
  -> Inbound Port (抽象化された内部関数呼び出し口)  
  -> ユースケース  
  -> ドメイン
- 出力の流れ：  
  -> ユースケース  
  -> Outbound Port (抽象化された外部技術呼び出し口)  
  -> Outbound Adapters (具体的な外部技術呼び出し口)  
  -> 外部 (HTTP・DBなど)

  ```
  apps/web/
    src/
      app/
        **/page.tsx                 # Inbound Adapters (UI：ユーザーエントリポイント)
        **/actions.ts               # Inbound Adapters (Server Actions：バックエンド入口)
        api/**/route.ts             # Inbound Adapters (Route Handler：外部用APIエンドポイントに限定)
        _shared/

      backend/
        xxx/                        # DDDでいうバウンデッドコンテキスト単位でディクレトリを分けておく
          applications/             # ユースケース
            xxx.port.ts             # Outbound Port (ユースケースが外部依存 (DB・LLMなど)を呼び出すための抽象)
            inbound-ports/          # Inbound Port (外部入力がユースケースを呼び出すための抽象)

          domains/                  # エンティティ・値オブジェクト・ドメインサービス
            entities/
            value-objects/
            services/

          infrastructure/
            xxx/xxx.adapter.ts      # Outbound Adapter (DB・LLMなど責務別ディレクトリで具体的にPortの内容を実装)

        composition/                # Composition Root (Inbound Adapterが呼ぶユースケースに対して、そのユースケースが要求するOutbound PortにOutbound Adapter含めた依存を注入)

        shared/                     # 横断ユーティリティ (Lib・Clients・Config・Typesなど)
  ```

## 3. docs/ (開発規約・設計資料)

- ディレクトリ構成は[Diátaxis](https://diataxis.fr/)を参考
  - 以下の4分類でドキュメントを整理
    - チュートリアル：キャッチアップ手順
    - ハウツーガイド：作業手順
    - リファレンス：事実
    - 決定記録：経緯

  ```
  docs/
    adrs/                 # 重要な意思決定ログ
    architecture/         # システム全体の構造
    feature/              # 重要な機能設計
    process/              # 開発プロセス・ルール
    product/              # 企画プロセス
      _overview/          # 企画のコンセプト・背景
      initiatives/        # イニシアチブ単位の計画・結果・考察
  ```
