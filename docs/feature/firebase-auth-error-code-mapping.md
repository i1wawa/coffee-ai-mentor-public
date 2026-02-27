# Coffee AI Mentor - Firebase Auth Error Code Mapping

- [共通（operation 非依存）のマッピング（先に判定される）](#共通operation-非依存のマッピング先に判定される)
- [operation 別のマッピング](#operation-別のマッピング)
  - [VERIFY_SESSION_COOKIE（セッションCookie検証）](#verify_session_cookieセッションcookie検証)
  - [VERIFY_ID_TOKEN（ID token 検証）](#verify_id_tokenid-token-検証)
  - [CREATE_SESSION_COOKIE（session cookie 発行）](#create_session_cookiesession-cookie-発行)
  - [REVOKE_REFRESH_TOKENS（refresh tokens revoke / 全端末サインアウト）](#revoke_refresh_tokensrefresh-tokens-revoke--全端末サインアウト)

## 共通（operation 非依存）のマッピング（先に判定される）

  <!-- prettier-ignore -->

| Firebase Auth code               | アプリ側 errorCode | shouldClearSessionCookie | 想定する復旧行動（メモ）                               |
| -------------------------------- | ------------------ | -----------------------: | ------------------------------------------------------ |
| （code が取れない / 不明な例外） | UNAVAILABLE        |                    false | 一時障害として扱い、運用で調査（誤爆サインアウト防止） |
| auth/too-many-requests           | RATE_LIMITED       |                    false | 待ってリトライ                                         |
| auth/internal-error              | UNAVAILABLE        |                    false | リトライ                                               |
| auth/invalid-credential          | INTERNAL_ERROR     |                    false | サーバ設定/権限/プロジェクトの運用調査                 |
| auth/insufficient-permission     | INTERNAL_ERROR     |                    false | サーバ設定/権限/プロジェクトの運用調査                 |
| auth/project-not-found           | INTERNAL_ERROR     |                    false | サーバ設定/権限/プロジェクトの運用調査                 |

## operation 別のマッピング

### VERIFY_SESSION_COOKIE（セッションCookie検証）

  <!-- prettier-ignore -->

| Firebase Auth code          | アプリ側 errorCode | shouldClearSessionCookie | 想定する復旧行動（メモ）                                       |
| --------------------------- | ------------------ | -----------------------: | -------------------------------------------------------------- |
| auth/session-cookie-expired | AUTH_INVALID       |                     true | cookie を削除して再サインイン（401ループ回避）                 |
| auth/session-cookie-revoked | AUTH_INVALID       |                     true | cookie を削除して再サインイン                                  |
| auth/invalid-session-cookie | AUTH_INVALID       |                     true | cookie を削除して再サインイン（互換吸収）                      |
| auth/user-disabled          | AUTH_INVALID       |                     true | cookie を削除して再サインイン（ユーザー無効）                  |
| auth/user-not-found         | AUTH_INVALID       |                     true | cookie を削除して再サインイン（ユーザー不在）                  |
| auth/argument-error         | AUTH_INVALID       |                     true | cookie 破損の実測吸収として cookie 削除                        |
| auth/invalid-argument       | AUTH_INVALID       |                     true | cookie 破損の可能性が高い扱い（互換吸収含む）                  |
| auth/invalid-id-token       | AUTH_INVALID       |                     true | cookie に idToken を渡した等を想定し cookie 削除で正常化       |
| auth/id-token-expired       | AUTH_INVALID       |                     true | 同上                                                           |
| auth/id-token-revoked       | AUTH_INVALID       |                     true | 同上                                                           |
| （上記以外の auth/\*）      | UNAVAILABLE        |                    false | 安易に AUTH_INVALID にせず一時障害扱い（誤爆サインアウト防止） |

### VERIFY_ID_TOKEN（ID token 検証）

  <!-- prettier-ignore -->

| Firebase Auth code     | アプリ側 errorCode | shouldClearSessionCookie | 想定する復旧行動（メモ）                  |
| ---------------------- | ------------------ | -----------------------: | ----------------------------------------- |
| auth/invalid-id-token  | AUTH_INVALID       |                    false | token 再取得 or 再サインイン              |
| auth/id-token-expired  | AUTH_INVALID       |                    false | token 再取得 or 再サインイン              |
| auth/id-token-revoked  | AUTH_INVALID       |                    false | token 再取得 or 再サインイン              |
| auth/invalid-argument  | VALIDATION_FAILED  |                    false | リクエスト修正（401寄せの誤誘導を避ける） |
| （上記以外の auth/\*） | UNAVAILABLE        |                    false | 一時障害寄りで返し運用で調査              |

### CREATE_SESSION_COOKIE（session cookie 発行）

  <!-- prettier-ignore -->

| Firebase Auth code                   | アプリ側 errorCode | shouldClearSessionCookie | 想定する復旧行動（メモ）                  |
| ------------------------------------ | ------------------ | -----------------------: | ----------------------------------------- |
| auth/invalid-id-token                | AUTH_INVALID       |                    false | token 再取得 or 再サインイン              |
| auth/id-token-expired                | AUTH_INVALID       |                    false | token 再取得 or 再サインイン              |
| auth/id-token-revoked                | AUTH_INVALID       |                    false | token 再取得 or 再サインイン              |
| auth/invalid-session-cookie-duration | INTERNAL_ERROR     |                    false | expiresIn 設定ミス（サーバ設定修正）      |
| auth/invalid-argument                | VALIDATION_FAILED  |                    false | リクエスト/サーバ実装の修正               |
| （上記以外の auth/\*）               | UNAVAILABLE        |                    false | 上流側問題の可能性→一時障害寄りで運用調査 |

### REVOKE_REFRESH_TOKENS（refresh tokens revoke / 全端末サインアウト）

  <!-- prettier-ignore -->

| Firebase Auth code     | アプリ側 errorCode | shouldClearSessionCookie | 想定する復旧行動（メモ）                     |
| ---------------------- | ------------------ | -----------------------: | -------------------------------------------- |
| auth/user-not-found    | AUTH_INVALID       |                     true | セッション成立しないため cookie 削除に寄せる |
| auth/user-disabled     | AUTH_INVALID       |                     true | 同上                                         |
| auth/invalid-argument  | VALIDATION_FAILED  |                    false | 実装バグや入力の問題→修正                    |
| （上記以外の auth/\*） | UNAVAILABLE        |                    false | 未知コードは一時障害寄り→運用調査            |
