# /api/users/me — HTTP契約

- [GET /api/users/me](#get-apiusersme)
- [DELETE /api/users/me](#delete-apiusersme)

前提:

- 全レスポンスは `Cache-Control: no-store` を含む
- 失敗時ボディ: `{"ok": false, "error": { "errorCode": "...", "errorId": "...", ... }}`
- 成功時ボディ（GET）: `{"ok": true, "data": { "uid": "..." }}`
- 成功時ボディ（DELETE）: `{"ok": true, "data": { "deleted": true }}`
- `Set-Cookie` は「セッションcookie削除を返すかどうか」を契約として扱う
  - 具体属性（HttpOnly/Secure/SameSite/Max-Age/Path 等）は別契約（サーバ側テストで担保）

## GET /api/users/me

Request body: なし（cookie のみ）

| 代表トリガー（例）                                                                    | HTTP Status | errorCode      | Set-Cookie（セッション削除） | クライアント推奨アクション（例）     |
| ------------------------------------------------------------------------------------- | ----------: | -------------- | ---------------------------- | ------------------------------------ |
| 異常に長いcookie（MAX_SESSION_COOKIE_CHARS超過）                                      |         401 | AUTH_INVALID   | あり                         | セッション破損扱い。再サインイン誘導 |
| cookie無し/空/空白                                                                    |         401 | AUTH_REQUIRED  | なし                         | 未ログイン扱い。ログインへ           |
| セッションcookie無効（expired/revoked/user-disabled/user-not-found 等）               |         401 | AUTH_INVALID   | あり                         | cookie削除→再サインイン誘導          |
| セッションcookie検証で id-token 無効系が混入（invalid-id-token 等）                   |         401 | AUTH_INVALID   | あり                         | cookie削除→再サインイン誘導          |
| セッションcookie検証で invalid-argument/argument-error                                |         401 | AUTH_INVALID   | あり                         | cookie削除→再サインイン誘導          |
| レート制限（auth/too-many-requests 等）                                               |         429 | RATE_LIMITED   | なし                         | 待って再試行（バックオフ）           |
| 一時障害/上流利用不能（auth/internal-error / code不明等）                             |         503 | UNAVAILABLE    | なし                         | リトライ。継続失敗ならサポート導線   |
| サーバ設定/権限不整合（invalid-credential/insufficient-permission/project-not-found） |         500 | INTERNAL_ERROR | なし                         | 運用調査・サポート導線               |
| 成功（セッション有効）                                                                |         200 | -              | なし                         | ログイン済みとして画面継続           |

## DELETE /api/users/me

Request body: なし（cookie のみ）

| 代表トリガー（例）                                                                      | HTTP Status | errorCode           | Set-Cookie（セッション削除） | クライアント推奨アクション（例）                        |
| --------------------------------------------------------------------------------------- | ----------: | ------------------- | ---------------------------- | ------------------------------------------------------- |
| unsafe method 防御（Sec-Fetch-Site=cross-site 等）                                      |         403 | ACCESS_DENIED       | なし                         | 不正送信/CSRF。UIは「操作できません」程度（再試行導線） |
| unsafe method 防御（Origin/Referer 不一致）                                             |         403 | ACCESS_DENIED       | なし                         | 同上                                                    |
| 異常に長いcookie（MAX_SESSION_COOKIE_CHARS超過）                                        |         401 | AUTH_INVALID        | あり                         | セッション破損扱い。再サインイン誘導                    |
| cookie無し/空/空白                                                                      |         401 | AUTH_REQUIRED       | なし                         | 未ログイン扱い。ログインへ                              |
| recentAuthMaxAgeMs が壊れている（<=0 等）                                               |         500 | INTERNAL_ERROR      | なし                         | 一時エラー。再試行/サポート導線                         |
| authTime が取れない（authTimeSeconds が無い等）                                        |         412 | PRECONDITION_FAILED | なし                         | 再認証が必要。ログイン継続のまま再認証フローへ          |
| recent login 不足（now - authTime > recentAuthMaxAgeMs）                               |         412 | PRECONDITION_FAILED | なし                         | 同上                                                    |
| セッションcookie無効（expired/revoked/user-disabled/user-not-found 等）                 |         401 | AUTH_INVALID        | あり                         | cookie削除→再サインイン誘導                             |
| delete対象ユーザー無効（operation=DELETE_USER の user-not-found/user-disabled）         |         401 | AUTH_INVALID        | あり                         | cookie削除→再サインイン誘導                             |
| レート制限（auth/too-many-requests 等）                                                 |         429 | RATE_LIMITED        | なし                         | 待って再試行（バックオフ）                              |
| 一時障害/上流利用不能（auth/internal-error / code不明等）                               |         503 | UNAVAILABLE         | なし                         | リトライ。継続失敗ならサポート導線                      |
| Firebase設定/権限不整合（invalid-credential/insufficient-permission/project-not-found） |         500 | INTERNAL_ERROR      | なし                         | 運用調査・サポート導線                                  |
| deleteUser 側の引数不正等（operation=DELETE_USER の invalid-argument 等）               |         400 | VALIDATION_FAILED   | なし                         | 実装不整合の疑い。ログ送信・サポート導線                |
| 成功（ユーザー削除完了）                                                                |         200 | -                   | あり                         | 退会完了。ローカル状態もクリアし初期画面へ              |
