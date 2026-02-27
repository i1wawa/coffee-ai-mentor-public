<!-- docs/adrs/0012-adopt-cloud-logging-controls-for-request-summary-volume.md -->

# Adopt Cloud Logging controls for request.summary volume management

## Context and Problem Statement

アプリケーションでは、1リクエストにつき必ず1本 request.summary ログを出力する方針を採用している。
この方針は、成功/失敗/例外いずれでも観測の欠落を避け、障害解析やSLO管理に必要な最低限の事実を残すことを狙っている。

一方で /api/users/me のような高頻度エンドポイントでは、401（未サインイン）が仕様上頻出し、request.summary が大量に出力される。
アプリケーション側の classify により severity を INFO に落としても、ログ自体の出力量は減らず、ノイズとコスト（保存・検索・可視化の負担）が増える。

ここで意思決定が必要なのは、request.summary の責務（事実の生成と意味付け）と、Cloud Logging の責務（保持・除外・サンプリングなどの保存戦略）を分離しつつ、運用上のノイズ問題を解消する方針を定めるためである。

## Decision Drivers

- 事実と意味付けと保持戦略の責務分離を崩さない
- ログ量とノイズを継続的に制御できる（設定変更で調整できる）
- 運用時の調査可能性を維持する（異常系は残す）
- 実装の一貫性と将来の理解容易性（ok/severity の意味がぶれない）

## Considered Options

- Option A: アプリ側で request.summary の出力自体を抑制する（例: ok=true のとき emit しない）
- Option B: /api/users/me の 401 を運用上の成功として ok=true 扱いにし、結果として error フィールドやログ運用を変える
- Option C: アプリは必ず request.summary を出し、Cloud Logging 側で除外・サンプリング・保持期間でログ量を制御する

## Considered Options Pros and Cons Table

- Option A
  - Pros
    - ログ量を確実に減らせる
    - Cloud Logging の設定に依存せずにノイズを抑えられる
  - Cons
    - request.summary は必ず1本出すという契約が崩れ、観測の欠落が起きやすい
    - エンドポイントごとに例外ルールが増え、将来の理解と変更が難しくなる

- Option B
  - Pros
    - /api/users/me の 401 ログを実質的に軽く扱える（error フィールド運用も変えられる）
    - アプリ内の分類ロジックだけでノイズ低減を試みられる
  - Cons
    - ok の意味が HTTP の成功/失敗からズレ、集計・可視化・アラートの前提を壊す
    - 401 が成功扱いになると、運用上の異常と仕様上の未サインインが混ざり、のちに混乱を招く

- Option C
  - Pros
    - 事実生成（アプリ）と保持戦略（Cloud Logging）を分離でき、意味の一貫性を保てる
    - 高頻度ノイズを、除外またはサンプリングで柔軟に制御できる（運用で調整可能）
  - Cons
    - Cloud Logging の設定管理が必要になり、環境差分（dev/stg/prod）の運用が増える
    - 除外しすぎると個別リクエスト追跡が難しくなるため、設計と検証が必要

## Decision Outcome

- Chosen option: Option C
  - Reasons:
    - request.summary は事実（http_status_code、latency_ms、errorId/errorCode など）を必ず生成する責務に寄せ、保持・量の制御は Cloud Logging の責務として切り出すことで、ok と severity の意味を一貫させられる
    - /api/users/me のような高頻度エンドポイントの INFO を Cloud Logging 側で除外またはサンプリングすることで、ノイズとコストを削減しつつ、WARNING/ERROR を確実に保持する運用が可能になる

## Positive Consequences

- アプリ側の request.summary 実装はシンプルなまま維持でき、ok と severity の意味がぶれない
- ログ量の調整を運用で行えるため、状況に応じた除外・サンプリング・保持期間の変更がしやすい
- /api/users/me の頻出 401（AUTH_REQUIRED）は INFO として扱いつつ、保存戦略でノイズを抑制できる

## Negative Consequences

- Cloud Logging 側の除外フィルタやサンプリング設定の設計・検証・保守が必要になる
- 調査のために一時的にログを増やしたい場合、アプリではなく Cloud Logging 設定変更の手順が必要になる
- 除外/サンプリング設計を誤ると、必要なログまで落とすリスクがある（運用ガードが必要）

## Relations

- 参考:
  - packages/observability/src/logging/request-summary.ts
    - request.summary の契約（1リクエストにつき必ず1本、ok=false のとき error フィールド付与、severity は classify で意味付け）
  - apps/web/src/app/api/users/me/route.ts
    - /api/users/me の classify 方針（AUTH_REQUIRED は INFO、AUTH_INVALID は WARNING）
