<!-- docs/adrs/0002-adopt-boundary-based-result-pattern-for-nextjs.md -->

# Adopt Boundary-based Result Pattern for Next.js Route Handlers and Server Actions

## Context and Problem Statement

Next.js App Routerにおいて、Route Handler と Server Action を跨いだ共通ログ基盤  
（request.summary）とエラーハンドリング方針を整理する必要が生じた。

背景として、以下の課題があった。

- Route Handler と Server Action で throw / Result（戻り値）が混在し、
  - API レスポンス契約（HTTP status / JSON / Cookie）が壊れやすい
  - UI イベント（onClick 等）起点で unhandled rejection が起きやすい
- Next.js は redirect() / notFound() などを throw による制御フローとして実装しており、
  それらを通常の例外として catch するとフレームワークの期待挙動が壊れる
- Node.js（単一プロセス） / Cloud Run（同一プロセスで 複数リクエストを並列処理） 環境では、未捕捉例外によるプロセス終了は運用上避けたい
- 運用面では、ユーザーからの問い合わせ対応を高速化するため、UI に参照用の errorId を表示し、ログや監視と即座に突合できる仕組みが求められる
- 想定内エラー（入力不備・業務エラー）と想定外エラー（バグ・未知の例外）が混在し、UI での扱いが一貫しにくい

## Decision Drivers

- 運用安全性（プロセスを不必要に落とさない）
- Next.js フレームワークとの整合性（制御フロー例外を壊さない）
- UI の安定性（イベント起点で unhandled にならない）
- 問い合わせ対応の容易さ（errorId による追跡）
- ログ一貫性（request.summary を必ず1リクエスト1本出す）
- 実装と運用の単純さ（過剰な分岐を増やさない）

## Considered Options

- Option A: Exception-first
  - Route Handler / Server Action ともに想定外は throw で伝播し、上流に任せる
- Option B: Mixed handling
  - 想定内は Result、想定外は throw とし、用途ごとに使い分ける
- Option C: Boundary-based Result Pattern
  - 境界ごとに返す形を固定し、原則 Result、Next.js 制御フロー例外のみ再スロー

## Considered Options Pros and Cons Table

- Option A: Exception-first
  - Pros
    - 呼び出し側のコードが短い
    - fail-fast でバグに気づきやすい
  - Cons
    - UI イベント起点で unhandled になりやすい
    - Route Handler のレスポンス契約が壊れやすい
    - errorId を UI に安定して出しにくい

- Option B: Mixed handling
  - Pros
    - 想定内エラーは UI で扱いやすい
  - Cons
    - 境界が二系統になり設計が複雑化する
    - どこで throw / Result にするかが曖昧になりやすい

- Option C: Boundary-based Result Pattern
  - Pros
    - Route Handler / Server Action の責務が明確になる
    - UI が安定し、errorId 運用と相性が良い
    - Next.js の制御フロー例外を安全に扱える
  - Cons
    - Result 分岐コードが増える
    - Next.js 内部仕様（制御フロー例外の判定）への理解が必要

## Decision Outcome

- Chosen option: Option C
  - Reasons:
    - Route Handler を HTTP 境界、Server Action を UI 境界として明確に分離し、それぞれで「返す形」を固定することで運用事故を減らせるため
    - UI イベント起点では例外伝播に頼れないため、想定外も Result に落として安定させられるため
    - errorId を UI に提示する運用を組み込みやすく、request.summary と監視基盤を自然に結びつけられるため

## Positive Consequences

- Route Handler の API レスポンス契約（status / JSON / Cookie）が安定する
- Server Action の呼び出しが UI イベント起点でも安全になる
- ユーザーが提示した errorId からログ・監視へ即到達できる
- request.summary が成功・失敗・制御フロー例外すべてで一貫して出力される

## Negative Consequences

- Result の分岐処理が増え、記述量がやや多くなる
- Next.js の制御フロー例外（redirect / notFound 等）を正しく再スローするための
  判定ロジックとテストが必要になる
- 想定外エラーを Result に潰すため、監視・ログ設計が弱いとバグが埋もれやすい

## Relations

apps/web/src/backend/shared/observability/request-summary.ts
apps/web/src/backend/shared/observability/nextjs-control-flow.ts
