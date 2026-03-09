<!-- docs/adrs/0009-adopt-firebase-authentication-for-web-auth.md -->

# Adopt Firebase Authentication for Web Authentication

## Context and Problem Statement

本 ADR は、Web アプリケーション向け認証基盤として何を採用するかを決定する。

本システムは、以下の前提を持つ。

- 無料または低コストで開始しやすく、初期のコスト予測がしやすいこと
- 将来的に SSR（Server-Side Rendering）、Route Handler、Server Actions 側で安定して認可したい
- OAuth やメール/パスワードを含む一般的な Web 認証を扱いたい

候補としては、Firebase Authentication、Supabase Auth、Auth.js、Neon Auth がある。

既に、DB と Auth は別々の評価軸で選ぶ方針を採っている。そのため本 ADR では、分離された Auth 提供元として何を採用するかを判断する。

## Decision Drivers

- 認証をアプリケーション DB から分離しやすいこと
- 個人開発の初期で無料または低コストで始めやすいこと
- Next.js、Cloud Run、SSR、サーバー側認可と相性が良いこと
- OAuth、メール/パスワードなど一般的な Web 認証を安定して扱えること
- 実装責務を過度に増やさず、マネージド認証として運用しやすいこと
- 将来のセッション管理、失効、サーバー側 Cookie 運用へ伸ばしやすいこと

## Considered Options

- Option A: Firebase Authentication を採用する
- Option B: Supabase Auth を採用する
- Option C: Auth.js を採用する
- Option D: Neon Auth を採用する

## Considered Options Pros and Cons Table

- Option A
  - Pros
    - 認証をアプリケーション DB から分離しやすく、DB の選択自由度を保ちやすい
    - Google、メール/パスワードなど一般的な認証方式をマネージドサービスとして利用できる
    - Admin SDK と session cookie により、SSR やサーバー側認可へ伸ばしやすい
    - Blaze では Tier 1 provider に 0-49,999 MAU の no-cost tier があり、開発初期と相性が良い
  - Cons
    - 認証基盤を Google に依存する
    - httpOnly cookie でサーバー認証に寄せる場合、session login endpoint や CSRF 対策の設計が必要になる
    - Spark では email link sign-in や phone auth に強い制約がある

- Option B
  - Pros
    - Auth、Postgres、Storage、Edge Functions を同一プラットフォームで扱え、初速を出しやすい
    - Free plan に 50,000 MAU があり、無料枠自体は強い
    - Next.js 向けの SSR ガイドや `@supabase/ssr` パッケージが用意されている
  - Cons
    - Auth が Supabase プロジェクトと一体であり、DB 分離方針とは少し緊張する
    - Next.js の SSR 構成では cookie 更新用の Proxy など、Supabase 前提の組み込みが必要になる
    - Free plan の project pause など、認証だけでなくプロジェクト全体の運用特性を受け入れる必要がある

- Option C
  - Pros
    - 認証フローやセッション戦略を柔軟に組み立てられる
    - JWT session なら DB なしでも始められる
    - Next.js との統合は強い
  - Cons
    - マネージド認証基盤ではなく、セッション戦略、永続化、メール、運用設計を自分で選ぶ必要がある
    - database session を使う場合は DB アダプタや永続化設計が増える
    - 無料枠の強い認証サービスを採るという問いに対しては、比較対象の性格が少し異なる

- Option D
  - Pros
    - Neon と同じ提供元で Auth を扱え、プラットフォーム数を減らせる
    - Free で 60,000 MAU があり、無料枠自体は強い
    - DB branch と auth branch を組み合わせた開発フローを取りやすい
  - Cons
    - DB と Auth を同じ提供元に寄せるため、分離方針と少し緊張する
    - Firebase Authentication より新しく、成熟度や運用知見が相対的に少ない
    - Neon を DB として選ぶ判断と、Auth を Neon に寄せる判断が連動しやすい

## Decision Outcome

- Chosen option: Option A
  - Reasons:
    - Firebase Authentication は、認証をアプリケーション DB から独立したマネージドサービスとして利用しやすく、DB 分離方針と最も素直に整合する
    - Google、メール/パスワードなど一般的な Web 認証を、開発初期でも扱いやすい無料または低コスト帯で始めやすい
    - Admin SDK と session cookie により、ブラウザ側ログインとサーバー側認可を橋渡ししやすく、Next.js、Cloud Run、SSR、Route Handler との相性が良い
    - 認証基盤を managed service に寄せることで、Auth.js のようにセッション戦略、永続化、メール、運用を自前で組み立てる判断責務を減らせる

本 ADR では、Web アプリケーション向け認証基盤として Firebase Authentication を採用する。

本 ADR は認証提供元の選定までを扱う。ID token の交換方式、session cookie の契約、CSRF 防御、popup 認証時の CSP 調整などの実装詳細は別 ADR で扱う。

## Positive Consequences

- 認証をアプリケーション DB から分離しつつ、安定したマネージド認証基盤を利用できる
- サーバー側 session cookie 運用により、SSR や Route Handler で認可を整理しやすい
- DB は PostgreSQL/Prisma、Auth は Firebase という形で責務分離しやすい
- 個人開発初期では無料または低コストで始めやすい

## Negative Consequences

- Google 依存が増える
- session cookie 化や CSRF 対策を含むサーバー側統合は自動ではなく、設計と実装が必要になる
- Spark では email link sign-in や phone auth の無料運用に制約がある
- Supabase のような単一プラットフォーム完結の簡便さや、Auth.js の細かな自由度はない

## Relations

- https://firebase.google.com/docs/auth/
- https://firebase.google.com/docs/auth/admin/manage-cookies
- https://firebase.google.com/docs/auth/limits
- https://cloud.google.com/identity-platform/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/auth/server-side/nextjs
- https://supabase.com/docs/guides/auth/server-side/oauth-with-pkce-flow-for-ssr
- https://authjs.dev/
- https://authjs.dev/concepts/session-strategies
- https://neon.com/pricing
- https://neon.com/docs/neon-auth/quickstart
