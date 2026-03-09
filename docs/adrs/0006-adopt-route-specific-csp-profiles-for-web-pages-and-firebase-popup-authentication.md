<!-- docs/adrs/0006-adopt-route-specific-csp-profiles-for-web-pages-and-firebase-popup-authentication.md -->

# Adopt Route-Specific CSP Profiles for Web Pages and Firebase Popup Authentication

## Context and Problem Statement

本システムは以下の前提を持つ。

- Next.js App Router を Cloud Run 上で運用する
- 画面系ルートには `proxy.ts` で nonce ベースの CSP と Reporting ヘッダーを付与する
- 認証基盤として Firebase Authentication を利用する
- Google サインインは Firebase Auth の `signInWithPopup` を利用する
- 認証ページでは Google / Firebase SDK が popup, iframe, 外部 script, 外部 connect を利用する

この構成では、通常画面では Google / Firebase 認証専用の外部許可元を極力持たない強い CSP を維持したい一方で、Firebase popup 認証画面では SDK 互換のために Trusted Types や認証専用許可元を調整する必要がある。

単一の CSP を全画面に適用するか、通常画面と popup 認証画面で CSP プロファイルを分けるか、設計判断が必要になった。

## Decision Drivers

- セキュリティ
- Firebase / Google OAuth SDK 互換性
- 本番運用安定性
- 理解容易性
- テスト容易性

## Considered Options

- Option A: 全画面に単一の CSP を適用する
- Option B: 通常画面と Firebase popup 認証画面で CSP プロファイルを分ける
- Option C: `signInWithRedirect` を前提に認証方式自体を切り替える

## Considered Options Pros and Cons Table

- Option A
  - Pros
    - 方針が単純で、ヘッダー運用が一様になる
    - 画面ごとの例外を意識しなくてよい
  - Cons
    - Firebase popup 認証との互換性調整がしにくい
    - 通常画面向けの Trusted Types 強制が認証画面では過剰になり得る

- Option B
  - Pros
    - 通常画面では認証専用許可元を持たない強い CSP を維持できる
    - popup 認証画面だけ Trusted Types 強制を外し、Google / Firebase 向け許可元を追加して SDK 互換性を優先できる
    - ルートごとの契約をテストで固定しやすい
  - Cons
    - CSP 方針が単一ではなくなる
    - 認証画面だけ例外ルールを理解する必要がある

- Option C
  - Pros
    - popup 固有の親子ウィンドウ制約を減らしやすい
    - popup 終了時のブラウザ warning から距離を置ける
  - Cons
    - UX が変わる
    - `authDomain` や auth helper 由来の CSP 調整が別途残りうる
    - 現行の認証導線に対して変更範囲が大きい

## Decision Outcome

- Chosen option: Option B
  - Reasons:
    - 通常画面では nonce ベース CSP と Trusted Types により防御強度を維持したい
    - Firebase popup 認証画面では Trusted Types 強制を外し、Google / Firebase 向けの `script-src`, `frame-src`, `connect-src` をその画面だけに付与することで、通常画面の最小権限と popup 認証の互換性を両立できる
    - ルート判定を `proxy.ts` に集約することで、運用時の理解と回帰テストがしやすい

本 ADR では以下を採用する。

- 通常画面では `default` プロファイルを使う
- Firebaseへの接続が発生するページ（`/sign-in` や `/app/settings/account` など）では `firebasePopupAuth` プロファイルを使う
- Google / Firebase popup 認証に必要な `script-src`, `frame-src`, `connect-src` の許可元は `firebasePopupAuth` プロファイルにのみ含める
- 通常画面の `default` では認証専用の外部許可元を含めず、`self` と必要最小限の外部通信先に絞る
- `firebasePopupAuth` プロファイルでは Trusted Types 強制を行わない

## Positive Consequences

- 通常画面の CSP を最小権限に寄せられる
- 認証画面の SDK 互換性を明示的に扱える
- どのルートがどの CSP プロファイルを使うかをコードとテストで固定できる
- 将来の CSP 調整時に通常画面と認証画面の影響を分けて考えられる

## Negative Consequences

- CSP の理解コストが上がる
- ルート追加時にどのプロファイルを選ぶか判断が必要になる
- 認証画面だけ例外設定を持つため、設定変更時に回帰確認が必要になる
- popup 認証起因のブラウザ warning が完全に消えるとは限らない

## Relations

- docs/adrs/0001-use-route-handlers-for-auth-session.md
- docs/adrs/0003-adopt-firebase-session-cookie-exchange-for-web-session-management.md
- apps/web/src/proxy.ts
- apps/web/src/csp-header.ts
- https://firebase.google.com/docs/auth/web/redirect-best-practices
