# /api/auth/session/revoke — HTTP契約

- [POST /api/auth/session/revoke](#post-apiauthsessionrevoke)

前提:

- 全レスポンスは `Cache-Control: no-store` を含む
- 失敗時ボディ: `{"ok": false, "error": { "errorCode": "...", "errorId": "...", ... }}`
- 成功時ボディ: `{"ok": true, "data": { "revoked": true }}`
- `Set-Cookie` は「セッションcookie削除を返すかどうか」を契約として扱う
  - 具体属性（HttpOnly/Secure/SameSite/Max-Age/Path 等）は別契約（サーバ側テストで担保）

## POST /api/auth/session/revoke

- Request body: なし（cookie のみ）

| 代表トリガー（例）                                                                        | HTTP Status | errorCode         | Set-Cookie（セッション削除） | クライアント推奨アクション（例）           |
| ----------------------------------------------------------------------------------------- | ----------: | ----------------- | ---------------------------- | ------------------------------------------ |
| unsafe method 防御（Sec-Fetch-Site=cross-site 等）                                        |         403 | ACCESS_DENIED     | なし                         | 不正送信/CSRF。操作を中断                  |
| unsafe method 防御（Origin/Referer 不一致）                                               |         403 | ACCESS_DENIED     | なし                         | 同上                                       |
| 異常に長いcookie（MAX_SESSION_COOKIE_CHARS超過）                                          |         200 | -                 | あり                         | no-op成功として端末cookieを掃除する        |
| cookie無し/空/空白                                                                        |         200 | -                 | あり                         | no-op成功として端末cookieを掃除する        |
| セッションcookie無効（expired/revoked/user-disabled/user-not-found 等）                   |         200 | -                 | あり                         | no-op成功として端末cookieを掃除する        |
| revoke対象ユーザー無効（operation=REVOKE_REFRESH_TOKENS の user-not-found/user-disabled） |         200 | -                 | あり                         | no-op成功として端末cookieを掃除する        |
| レート制限（auth/too-many-requests 等）                                                   |         429 | RATE_LIMITED      | あり                         | 待って再試行（バックオフ）                 |
| 一時障害/上流利用不能（auth/internal-error / code不明等）                                 |         503 | UNAVAILABLE       | あり                         | リトライ。継続失敗ならサポート導線         |
| Firebase設定/権限不整合（invalid-credential/insufficient-permission/project-not-found）   |         500 | INTERNAL_ERROR    | あり                         | 運用調査・サポート導線                     |
| revoke 側の引数不正等（operation=REVOKE_REFRESH_TOKENS の invalid-argument 等）           |         400 | VALIDATION_FAILED | あり                         | 実装不整合の疑い。ログ送信・サポート導線   |
| 成功（revoke 実行完了）                                                                   |         200 | -                 | あり                         | セキュリティサインアウト完了として遷移する |
