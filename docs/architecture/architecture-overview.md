# Coffee AI Mentor - Architecture Overview

- [1. システムコンテキスト図](#1-システムコンテキスト図)
- [2. コンテナ図](#2-コンテナ図)
- [3. 技術スタック](#3-技術スタック)
- [4. 外部依存](#4-外部依存)
- [5. デプロイ環境](#5-デプロイ環境)

## 1. システムコンテキスト図

- [C4 model「System context diagram」](https://c4model.com/diagrams/system-context)を参考

```mermaid
flowchart LR
  %% ---------- Styling ----------
  classDef person   fill: #fff, fill-opacity:0, stroke: #e25100, stroke-width:1.5px, color:#e25100;
  classDef system   fill: #fff, fill-opacity:0, stroke: #4979f5, stroke-width:1.5px, color:#4979f5;
  classDef external fill: #fff, fill-opacity:0, stroke: #008da6, stroke-width:1.5px, color:#008da6;

  linkStyle default stroke: #888,stroke-width: 1px;

  %% ---------- Persons ----------
  user("**自宅コーヒー愛好家**<br />[Person]"):::person

  %% ---------- Internal Software Systems ----------
  CAM["**Coffee AI Mentor**<br />[Software System]<br />AIチャット付きコーヒーノートシステム"]:::system

  %% ---------- External Software Systems ----------
  firebase_auth["**Firebase Authentication**<br />[Software System]<br />認証サービス"]:::external
  neon["**Neon**<br />[Software System]<br />DBサービス"]:::external
  llm["**Gemini API**<br />[Software System]<br />大規模言語モデル"]:::external
  email["**Resend**<br />[Software System]<br />メール送信サービス"]:::external

  %% ---------- Relationships ----------
  user  .->|"<small>AIメンターと対話しながらコーヒーを記録・振り返る"</small>| CAM

  CAM   .->|"<small>ユーザー情報の認証"</small>| firebase_auth
  CAM   .->|"<small>ユーザー情報・コーヒー記録の保存・取得"</small>| neon
  CAM   .->|"<small>AIメンターの回答を依頼"</small>| llm
  CAM   .->|"<small>認証メール送信を依頼"</small>| email
  email .->|"<small>認証メール送信"</small>| user
```

## 2. コンテナ図

- [C4 model「Container diagram」](https://c4model.com/diagrams/container)を参考
- フロントエンドとバックエンドは同一デプロイユニットで動いているが、責務的に論理分割

```mermaid
flowchart LR
  %% ---------- Styling ----------
  classDef person    fill: #fff,fill-opacity:0,stroke: #e25100,stroke-width:1.5px,color:#e25100;
  classDef container fill: #fff,fill-opacity:0,stroke: #4979f5,stroke-width:1.5px,color:#4979f5;
  classDef external  fill: #fff,fill-opacity:0,stroke: #008da6,stroke-width:1.5px,color:#008da6;

  linkStyle default stroke:#888,stroke-width:1px;

  style CAM fill:#fff,fill-opacity:0,stroke:#4979f5,stroke-width:1.5px, stroke-dasharray: 5 5, color:#4979f5;

  classDef deployment color:#888,fill-opacity:0,stroke-opacity:0;

  %% ---------- Persons ----------
  user("**自宅コーヒー愛好家**<br />[Person]"):::person

  %% ---------- System Boundary & Containers ----------
  subgraph CAM["**Coffee AI Mentor**<br />[Software System]<br />AIチャット付きコーヒーノートシステム"]
    FE["**Next.jsフロントエンド**<br />[Container: Next.js, TypeScript, Tailwind CSS, shadcn/ui]<br /><small>ブラウザ上のUIとAIチャット画面</small>"]:::container
    BE["**Next.jsバックエンド**<br />[Container: Next.js（Node.js）, TypeScript, Prisma]<br /><small>記録・AI対話・集計ロジック</small>"]:::container
  end

  %% ---------- External Software Systems ----------
  firebase_auth["**Firebase Authentication**<br />[Software System]<br />認証サービス"]:::external
  neon["**Neon**<br />[Software System]<br />DBサービス"]:::external
  llm["**Gemini API**<br />[Software System]<br />大規模言語モデル"]:::external
  error["**Sentry**<br />[Software System]<br />エラー監視サービス"]:::external
  log["**Google Cloud Observability**<br />[Software System]<br />ログ管理・モニタリングサービス"]:::external
  email["**Resend**<br />[Software System]<br />メール送信サービス"]:::external

  %% ---------- Relationships ----------
  user   .->|"<small>AIメンターと対話しながらコーヒーを記録・振り返る</small>" | FE

  FE .->|"<small>呼び出し<br />[Next.js Server Actions]</small>" | BE

  BE    .->|"<small>ユーザー情報の認証<br />[JSON・HTTPS]</small>" | firebase_auth
  BE    .->|"<small>ユーザー情報・コーヒー記録の保存・取得<br />[JSON・HTTPS]</small>" | neon
  FE .->|"<small>クライアント側セッション確認<br />[JSON・HTTPS]</small>" | firebase_auth
  FE .->|"<small>簡易なデータ取得<br />[JSON・HTTPS]</small>" | neon

  BE    .->|"<small>AIメンター回答の生成を依頼<br />[JSON・HTTPS]</small>" | llm

  FE .->|"<small>フロントエンドのエラー送信<br />[JSON・HTTPS]</small>" | error
  BE    .->|"<small>バックエンドのエラー・パフォーマンス情報送信<br />[JSON・HTTPS]</small>" | error

  BE    .->|"<small>アプリケーションログ・メトリクス送信<br />[JSON・HTTPS]</small>" | log

  BE    .->|"<small>認証メール送信を依頼<br />[JSON・HTTPS]</small>" | email
  email  .->|"<small>認証メール送信</small>" | user
```

## 3. 技術スタック

- 開発環境
  - Docker
- インフラ構成管理
  - Terraform
- パッケージマネージャ
  - pnpm
- 開発言語・フレームワーク
  - Next.js
  - TypeScript
- UI・スタイリング
  - Tailwind CSS
  - Shadcn/ui
- ツアーガイド
  - React Joyride
- リンター・フォーマッター
  - Biome
  - Prettier（マークダウン用）
- フォーム・バリデーション
  - React Hook Form
  - Zod
- 状態管理
  - TanStack Query
  - Zustand
- テスト
  - Vitest
  - Testing Library
  - Playwright
- テスト支援
  - Mock Service Worker
  - Fetch Cookie
  - Tough Cookie
  - Firebase Authentication emulator
  - Execa
- 環境変数
  - dotenv
- ORM
  - Prisma
- 認証
  - Firebase Authentication JavaScript SDK
  - Firebase Admin SDK
- 日付操作
  - date-fns

## 4. 外部依存

- ホスティング
  - Google Cloud Run
- LLM
  - Vercel AI SDK
  - Gemini API
- DB
  - Neon（Postgres + Row Level Security）
- 認証
  - Firebase Authentication
- リポジトリ
  - GitHub
- CI/CD
  - GitHub Actions
- ログ・モニタリング
  - Sentry
  - Google Cloud Logging
  - Google Cloud Monitoring
- メール
  - Resend

## 5. デプロイ環境

- ステージング環境は、将来ユーザー数が増えた段階で追加

<!-- prettier-ignore -->
| 環境             | 開発環境                | ステージング環境 | 本番環境                                                              |
| --------------- | ---------------------- | ------------- | -------------------------------------------------------------------- |
| ホスティング      | 開発PC上のDockerコンテナ  |       -       | Google Cloud Runプロジェクト`coffee-ai-mentor-prod`（asia-northeast1） |
| DB              | Supabase CLI           |       -       | Supabaseプロジェクト`coffee-ai-mentor-prod`                            |
| 認証             | Supabase CLI           |       -       | 上記Supabase Auth                                                    |
| LLM             | 開発用Gemini APIキー     |       -       | `GEMINI_API_KEY_PROD`を用いたGemini API呼び出し                        |
| ログ・モニタリング | ローカルログ出力          |       -       | Sentryプロジェクト`coffee-ai-mentor-prod`・Cloud Logging               |
| メール           | モック or ローカルログ出力 |       -       | Resendプロジェクト`coffee-ai-mentor`（prodキー）                        |
