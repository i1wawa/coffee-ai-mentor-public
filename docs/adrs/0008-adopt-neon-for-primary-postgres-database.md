<!-- docs/adrs/0008-adopt-neon-for-primary-postgres-database.md -->

# Adopt Neon for Primary Postgres Database and Keep Authentication Separate

## Context and Problem Statement

本システムは、Next.js App Router と TypeScript を用いたフルスタック Web アプリケーションであり、以下の要件を持つ。

- アプリケーションデータを永続化するためのリレーショナル DB が必要である
- メールリンク、OAuth、セッション管理などを含む認証基盤が必要である
- 開発初期は無料または低コストで始めたい
- 将来の本番運用や移植性を考え、特定のプラットフォームへの過度な密結合は避けたい
- Prisma と PostgreSQL を中心に、一般的な Web アプリの構成へ寄せたい

このとき、次の設計判断が必要になる。

- DB と Auth を同じプラットフォームにまとめるか
- DB は DB として選び、Auth は別サービスとして分離するか

なお、Auth を分離する選択肢では、Firebase Authentication は有力な候補になる。本 ADR で候補として扱う Firebase Authentication は認証サービスであり、DB 候補ではなく、分離する Auth サービスの候補として扱う。一方で、Firebase は Firebase Data Connect により Cloud SQL for PostgreSQL ベースの選択肢も持つため、DB 側の比較対象には Firebase Data Connect を別 option として含める。

本 ADR では、主たる永続化先として何を採用し、Auth を DB と同一基盤にまとめるかどうかを決定する。

## Decision Drivers

- 無料または低コストで開始しやすく、初期のコスト予測がしやすいこと
- 将来の移植性と責務分離を保ちやすいこと
- 認証とアプリケーションデータの障害切り分けや変更容易性を確保しやすいこと

## Considered Options

- Option A: Neon を主 DB にし、Auth は Firebase Authentication など別サービスへ分離する
- Option B: Supabase を採用し、Postgres と Auth を同一プラットフォームにまとめる
- Option C: Neon を主 DB にし、Auth も Neon Auth にまとめる
- Option D: Firebase Data Connect を採用し、Firebase Authentication との統合を前提にする

## Considered Options Pros and Cons Table

- Option A
  - Pros
    - Neon の branching、autoscaling、serverless Postgres の利点をそのまま活かせる
    - DB はデータモデリングやマイグレーション、Auth は認証機能やセッション管理という別軸で評価しやすい
  - Cons
    - DB と Auth を別々に構成するため、初期セットアップは一体型より少し増える
    - セッション連携やユーザー同期など、境界の設計が必要になる
    - 認証 UI や運用を含めると、単一サービス完結より判断箇所が増える

- Option B
  - Pros
    - Postgres、Auth、Storage、Edge Functions をまとめて使え、初速を出しやすい
    - 単一プラットフォームで完結しやすく、学習対象を絞りやすい
    - pgvector など AI アプリと相性の良い周辺機能も利用しやすい
  - Cons
    - DB と Auth の選定が一体化し、片方だけ変えたいときの自由度が下がる
    - Free plan の project pause など、BaaS 全体の運用特性を受け入れる必要がある

- Option C
  - Pros
    - DB と Auth を Neon に寄せることで、プラットフォーム数を減らせる
    - Neon Auth の無料枠は十分強い
    - 将来的に DB branch と auth branch を組み合わせた開発フローを取りやすい
  - Cons
    - Neon Auth は Firebase Authentication より新しく、成熟度や運用知見が相対的に少ない
    - DB と Auth を同じ提供元にまとめるため、障害や移行時の独立性は下がる

- Option D
  - Pros
    - Firebase Authentication と統合しやすく、認証文脈を DB/アクセス制御に持ち込みやすい
    - Firebase に寄せた開発体験を取りやすい
    - Cloud SQL for PostgreSQL ベースの managed な選択肢を持てる
  - Cons
    - 恒久無料の DB としては Neon より不利になりやすい
    - Prisma で素の PostgreSQL を扱う構成とは少し異なる層が増える
    - DB と Auth をまとめる方向へ設計が寄りやすい

## Decision Outcome

- Chosen option: Option A
  - Reasons:
    - Auth は DB と別の評価軸で選びたいため、DB プラットフォームに統合せず分離したほうが判断の自由度が高い
    - DB はデータモデリング、マイグレーション、接続方式、運用移植性で評価したい一方、Auth は OAuth、メールリンク、セッション管理、運用成熟度で評価したいため、同一基盤にまとめる必然が弱い
    - Supabase、Neon Auth、Firebase Data Connect は魅力的だが、いずれも DB と Auth を同時に固定しやすく、責務分離と移植性の面では Option A より制約が増える
    - DB の開発体験と Auth の成熟度を別々に最適化できる構成のほうが後悔しにくい
    - まとめる選択は初速の面で有利だが、今回は最短構築よりも、後から片方だけ変えられることを優先する

本 ADR では、主たる永続化先として Neon を採用し、Auth は DB と同一基盤に固定しない。

## Positive Consequences

- DB と Auth を別々の評価軸で選べるため、意思決定が整理しやすい
- Neon を PostgreSQL として素直に使いつつ、Auth 側は Firebase など成熟した選択肢を採りやすい
- 将来、Auth だけまたは DB だけを差し替える余地を残しやすい
- 障害、性能、コストの問題を DB と Auth で切り分けやすい

## Negative Consequences

- 単一プラットフォーム完結より、初期統合作業は増える
- ユーザー ID 連携、セッション境界、認可設計などで責務分離を意識した設計が必要になる
- Neon Auth や Supabase Auth を使う一体型の簡便さはない

## Relations

- docs/architecture/architecture-overview.md
- https://neon.com/pricing
- https://neon.com/docs/conceptual-guides/branching/
- https://neon.com/docs/neon-auth/quickstart
- https://firebase.google.com/docs/data-connect
- https://firebase.google.com/docs/data-connect/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://cloud.google.com/identity-platform/pricing
- https://www.prisma.io/docs/orm/overview/databases/postgresql
