<!-- docs/adrs/0003-adopt-firebase-session-cookie-exchange-for-web-session-management.md -->

# Adopt Firebase Session Cookie Exchange for Web Session Management

## Context and Problem Statement

Next.js を Cloud Run 上で運用し、Web クライアントの認証に Firebase Auth を採用する。

課題は以下。

- Web クライアントで取得した Firebase ID token を、アプリ側の認証状態として安全かつ運用しやすい形に落とし込みたい。
- SSR(Server-Side Rendering)や Route Handler 側の認可で扱いやすくしたい。
- Cookie ベース認証にする場合の CSRF(Cross-Site Request Forgery)を、運用・実装コストを過剰に増やさずに抑えたい。
- Cloud Run のステートレス実行を前提に、サーバ内セッションストア無しで成立させたい。

本 ADR では、ID token の受け渡し方法、セッション Cookie の契約、CSRF 防御の方式を決定する。

## Decision Drivers

- セキュリティ: XSS(Cross-Site Scripting)とCSRFのリスク低減
- SSR/Route Handler との相性: サーバ側で安定して認証状態を解釈できること
- 運用性: Cloud Run ステートレス前提で成立し、運用・障害対応が単純であること
- 実装一貫性: Cookie 名・属性・失効処理のブレを防ぎやすいこと
- 将来拡張性: オリジン増加や中継追加などの変更に耐える余地があること

## Considered Options

- Option A: Firebase Session Cookie exchange + Fetch Metadata and Origin/Referer guard（CSRFトークン無し）
- Option B: Firebase Session Cookie exchange + CSRF token（Synchronizer Token Pattern）
- Option C: Bearer token（Authorization）で毎回 Firebase ID token を送信して検証（Cookie セッション無し）

## Considered Options Pros and Cons Table

- Option A
  - Pros
    - ID token を一度だけ交換し、以後は HttpOnly セッション Cookie で扱えるため SSR/Route Handler と相性が良い
    - Cookie 名と属性を固定でき、__Host- 接頭辞でサブドメイン共有事故を避けやすい
    - CSRF 対策を Fetch Metadata と Origin/Referer フォールバックに寄せ、クライアント側の CSRF トークン実装を不要にできる
    - 無効セッション時に Set-Cookie(Max-Age=0) で確実に失効させ、クライアント復旧が速い
  - Cons
    - Sec-Fetch-Site 欠落や Origin/Referer の欠落がある環境では正当リクエストを弾く可能性がある
    - same-site の扱い、allowlist の有無、Forwarded ヘッダの信頼など設定次第で強度と運用容易性が変わる
    - XSS は別対策が必須であり、セッション方式だけでは解決しない

- Option B
  - Pros
    - CSRF トークンで明示的に防御でき、古いクライアントや特殊な経路でも成立しやすい
    - same-site 運用や中継の影響を受けにくく、CSRF の説明責任が取りやすい
  - Cons
    - トークン配布、保管、送信、回転など実装と運用の複雑性が増える
    - Next.js の複数経路(Route Handler/Server Actions/フォーム送信)に適用漏れが起きやすい
    - デバッグ・テスト観点が増え、チームの運用負荷が上がる

- Option C
  - Pros
    - ブラウザが自動送信する Cookie を使わないため、CSRF の形になりにくい
    - API 利用がブラウザ以外へ拡張しやすい
  - Cons
    - ブラウザ側で ID token の保管と更新を扱う必要があり、XSS 影響面が増えやすい
    - SSR/Route Handler での一貫した認証が難しくなりやすい
    - 全リクエストで検証が必要になり、実装とパフォーマンスの考慮点が増える

## Decision Outcome

- Chosen option: Option A
  - Reasons:
    - SSR/Route Handler と相性が良く、Cloud Run のステートレス前提でセッション管理を単純化できる
    - Cookie 契約を __Host-session + HttpOnly/Secure/SameSite/Path=/ + Max-Age に固定し、実装ブレとクッキー事故を減らせる
    - CSRF 対策を Fetch Metadata 優先 + Origin/Referer フォールバック + 欠落時拒否により、実装コストを抑えつつ unsafe method の防御を実現できる
    - 単一オリジン運用を前提に Sec-Fetch-Site は same-origin のみ許可する

## Positive Consequences

- 認証状態が HttpOnly セッション Cookie に集約され、サーバ側での認可が簡潔になる
- Cookie 名・属性・失効処理がユーティリティに集約され、Route Handler ごとの実装差分が減る
- CSRF トークン配布のための追加 API とクライアント改修が不要になる

## Negative Consequences

- Sec-Fetch-Site や Origin/Referer が欠落する環境では false negative ではなく false positive を起こし得るため、運用上の例外対応が必要になる可能性がある
- same-site を許可するか、Forwarded ヘッダを信頼するか、allowlist を使うかは将来の構成変更に合わせて再検討が必要
- 現状は単一オリジン運用を前提に same-site を許可していないため、サブドメイン連携が必要になった場合は再検討が必要
- XSS 対策は別途(CSP 等)が必須であり、この ADR の範囲外の追加施策が必要

## Relations

- 実装:
  - apps/web/src/backend/auth/auth-contract.ts（POST /api/auth/session の入力型を SessionIssueBody に固定）
  - apps/web/src/app/api/auth/session/route.ts（ID token 検証後に createSessionCookie() で発行し Set-Cookie）
  - apps/web/src/backend/shared/http/cookies.ts（Cookie 名 __Host-session と属性、削除 Set-Cookie を集約）
  - apps/web/src/backend/shared/http/request-origin-guard.ts（unsafe method を Sec-Fetch-Site + Origin/Referer で防御）
