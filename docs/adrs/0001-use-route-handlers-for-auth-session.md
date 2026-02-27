<!-- docs/adrs/0001-use-route-handlers-for-auth-session.md -->

# Use Route Handlers for Web Authentication Session Establishment

## Context and Problem Statement

本システムは以下の前提を持つ。

- 認証基盤に Firebase Authentication を使用する
- Web（ブラウザ）では HttpOnly セッション Cookie による認証を採用する
- Next.js（App Router）を Cloud Run 上で運用する
- 将来的にスマホ（ネイティブアプリ）から同一バックエンドを利用する可能性がある
- モノレポ構成で、Web / Mobile でドメインロジックを共有したい

この構成において、Firebase Auth の ID トークンをサーバー側で検証し、HttpOnly セッション Cookie を発行する処理を、  
Server Actions で実装するか、Route Handlers で実装するかという設計判断が必要となった。

## Decision Drivers

- 運用安定性（デプロイ切替・旧ページ利用時に壊れにくいこと）
- 将来拡張性（Web/スマホ構成やフロント分離への耐性）
- セキュリティ（特にサインイン CSRF / セッション固定攻撃への対処）
- 理解容易性・テスト容易性（API としての明確さ）
- 二重実装・設計分岐の回避

## Considered Options

- Option A: Server Actions で実装する  
  （Web 内部のミューテーションとして完結させる）
- Option B: Route Handlers で実装する  
  （固定 URL の HTTP API として提供する）
- Option C: Server Actions と Route Handlers の両方に同等ロジックを実装する  
  （Web 専用 / API 専用で分ける）

## Considered Options Pros and Cons Table

- Option A: Server Actions
  - Pros
    - Web 内部に閉じた実装で自然
    - Origin / Host チェックなどのセキュリティ初期値が強い
    - Cookie 操作を直接行える
  - Cons
    - ビルド間で Action ID が変わり得る
    - デプロイ切替時に旧ページから失敗し得る
    - 外部クライアントから利用できない

- Option B: Route Handlers
  - Pros
    - URL 固定で運用が安定
    - API として明確でテストしやすい
    - 将来のフロント分離・外部クライアント対応が容易
  - Cons
    - CSRF 対策を自前で設計する必要
    - 初期実装量がやや多い

- Option C: 両方に実装
  - Pros
    - 用途別に最適化可能
    - Web 側は Server Actions の利便性を活かせる
  - Cons
    - ロジック二重化のリスク
    - 修正漏れ・仕様差が発生しやすい
    - 長期的な保守コストが高い

## Decision Outcome

- Chosen option: Option B – Route Handlers で実装する
  - Reasons:
    - サインイン導線は「失敗すると即 UX が破壊される」ため、Action ID に依存しない URL 固定の安定性を最優先とする。
    - 将来、Web フロントが分離されたり、WebView・管理画面・E2E テストなど別クライアントから同等の処理を呼びたい可能性を排除しない。
    - 「Web 専用処理」であっても、HTTP API として明示した方が設計の境界が明確で理解しやすい。
    - Server Actions の利便性は、必要に応じてRoute Handler を呼び出す薄いラッパーとして利用可能であり、本体ロジックを二重化する必要はない。

## Positive Consequences

- 認証セッション確立処理が 壊れにくく、デプロイに強い
- API として明確になり、E2E / API テストが容易
- 将来の構成変更（スマホ本格対応、フロント分離）に耐えやすい
- 認証・ドメインロジックを Route Handlers を起点に一元管理できる

## Negative Consequences

- CSRF（特にサインイン CSRF）対策を明示的に設計・実装する必要がある
- Web 専用処理としては、Server Actions よりやや実装が冗長になる

## Relations

apps/web/src/app/api/auth/session/route.ts
apps/web/src/app/api/users/me/route.ts
