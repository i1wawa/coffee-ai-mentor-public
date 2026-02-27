# /api/auth/session — HTTP契約

- [GET /api/auth/session](#get-apiauthsession)
- [POST /api/auth/session](#post-apiauthsession)
- [DELETE /api/auth/session](#delete-apiauthsession)

前提:

- 全レスポンスは `Cache-Control: no-store` を含む
- 失敗時ボディ: `{"ok": false, "error": { "errorCode": "...", "errorId": "...", ... }}`
- `Set-Cookie` は「セッションcookieを発行/削除するか」を契約として扱う
  - 具体属性（HttpOnly/Secure/SameSite/Max-Age/Path 等）は別契約（サーバ側テストで担保）

## GET /api/auth/session

Request body: なし（cookie のみ）

成功時ボディ:

- `{"ok": true, "data": { "authenticated": true, "user": { "uid": "..." } }}`
- `{"ok": true, "data": { "authenticated": false, "user": null }}`

| 代表トリガー（例）                                                                    | HTTP Status | errorCode      | Set-Cookie（セッション削除） | クライアント推奨アクション（例）           |
| ------------------------------------------------------------------------------------- | ----------: | -------------- | ---------------------------- | ------------------------------------------ |
| 異常に長いcookie（MAX_SESSION_COOKIE_CHARS超過）                                      |         200 | -              | あり                         | 壊れcookieを掃除して未サインイン扱いにする |
| cookie無し/空/空白                                                                    |         200 | -              | なし                         | 未サインインとして画面継続                 |
| セッションcookie無効（expired/revoked/user-disabled/user-not-found 等）               |         200 | -              | あり                         | 壊れcookieを掃除して再サインイン導線へ     |
| レート制限（auth/too-many-requests 等）                                               |         429 | RATE_LIMITED   | なし                         | 待って再試行（バックオフ）                 |
| 一時障害/上流利用不能（auth/internal-error / code不明等）                             |         503 | UNAVAILABLE    | なし                         | リトライ。継続失敗ならサポート導線         |
| サーバ設定/権限不整合（invalid-credential/insufficient-permission/project-not-found） |         500 | INTERNAL_ERROR | なし                         | 運用調査・サポート導線                     |
| 成功（セッション有効）                                                                |         200 | -              | なし                         | ログイン済みとして画面継続                 |

## POST /api/auth/session

Request body:

- `{"idToken": "..."}`

成功時ボディ:

- `{"ok": true, "data": { "issued": true }}`

| 代表トリガー（例）                                                                    | HTTP Status | errorCode         | Set-Cookie（セッション発行） | クライアント推奨アクション（例）   |
| ------------------------------------------------------------------------------------- | ----------: | ----------------- | ---------------------------- | ---------------------------------- |
| unsafe method 防御（Sec-Fetch-Site=cross-site 等）                                    |         403 | ACCESS_DENIED     | なし                         | 不正送信/CSRF。操作を中断          |
| unsafe method 防御（Origin/Referer 不一致）                                           |         403 | ACCESS_DENIED     | なし                         | 同上                               |
| Content-Type が JSON 以外                                                             |         400 | VALIDATION_FAILED | なし                         | リクエスト形式を修正する           |
| Content-Length が上限超過（MAX_JSON_BODY_BYTES 超過）                                 |         400 | VALIDATION_FAILED | なし                         | 入力サイズを縮小する               |
| JSON壊れ/追加フィールド/空idToken（Zod検証失敗）                                      |         400 | VALIDATION_FAILED | なし                         | リクエストボディを修正する         |
| idToken 無効（invalid-id-token / id-token-expired / id-token-revoked）                |         401 | AUTH_INVALID      | なし                         | トークン再取得または再サインイン   |
| レート制限（auth/too-many-requests 等）                                               |         429 | RATE_LIMITED      | なし                         | 待って再試行（バックオフ）         |
| 一時障害/上流利用不能（auth/internal-error / code不明等）                             |         503 | UNAVAILABLE       | なし                         | リトライ。継続失敗ならサポート導線 |
| サーバ設定/権限不整合（invalid-credential/insufficient-permission/project-not-found） |         500 | INTERNAL_ERROR    | なし                         | 運用調査・サポート導線             |
| session 有効期限設定の不整合（invalid-session-cookie-duration 等）                    |         500 | INTERNAL_ERROR    | なし                         | サーバ設定を修正する               |
| 成功（session cookie 発行）                                                           |         200 | -                 | あり                         | セッション開始として画面継続       |

## DELETE /api/auth/session

Request body: なし（cookie のみ）

成功時ボディ:

- `{"ok": true, "data": { "cleared": true }}`

| 代表トリガー（例）                                 | HTTP Status | errorCode     | Set-Cookie（セッション削除） | クライアント推奨アクション（例）   |
| -------------------------------------------------- | ----------: | ------------- | ---------------------------- | ---------------------------------- |
| unsafe method 防御（Sec-Fetch-Site=cross-site 等） |         403 | ACCESS_DENIED | なし                         | 不正送信/CSRF。操作を中断          |
| unsafe method 防御（Origin/Referer 不一致）        |         403 | ACCESS_DENIED | なし                         | 同上                               |
| cookie無し/空/空白                                 |         200 | -             | あり                         | 冪等にサインアウト完了として扱う   |
| cookie あり（通常サインアウト）                    |         200 | -             | あり                         | 端末側セッションを削除して遷移する |
