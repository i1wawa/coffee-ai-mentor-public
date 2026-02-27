// contracts/src/auth/auth-contract.ts
// ========================================================
// 概要:
// - 認証/セッション周りの HTTP 契約（共通）
// - クライアント非依存で、apps/web（Route Handler / Server Actions / Proxy）とテストから参照される
//
// 責務:
// - 認証系エンドポイントの相対パス・ヘッダ名・DTO を 1 箇所に集約し、参照側のズレを防ぐ
// ========================================================

/**
 * 認証関連 API の相対パス（BFF内）
 * - Route Handler の実装やテストで共有する
 * - パス変更時に、参照側の修正点を局所化する
 */
export const AUTH_PATHS = {
  session: "/api/auth/session",
  revoke: "/api/auth/session/revoke",
} as const;

/**
 * 認証セッション取得 API（GET /api/auth/session）の Response
 */
export type AuthSessionResponse =
  | { authenticated: true; user: { uid: string } }
  | { authenticated: false; user: null };

/**
 * session 発行 API（POST /api/auth/session）の Request ボディ
 * - 固定ルール：idToken は「bodyのみ」
 *
 * 注意:
 * - idToken をヘッダに載せる設計にしない（ログやプロキシで扱いがブレやすい）
 * - body の shape を固定することでテストと実装のズレを防ぐ
 */
export type AuthSessionIssueRequest = {
  idToken: string;
};

/**
 * session 発行 API（POST /api/auth/session）の成功 Response
 */
export type AuthSessionIssueResponse = {
  issued: true;
};

/**
 * セキュリティ用サインアウト API（POST /api/auth/session/revoke）の成功 Response
 *
 * 注意:
 * - Request body は送らない契約（cookie のみ）
 */
export type AuthSessionRevokeResponse = {
  revoked: true;
};

/**
 * サインアウト API（DELETE /api/auth/session）の成功 Response
 *
 * 注意:
 * - DELETE は body を送らない契約
 * - 成功時は常に cleared=true を返し、冪等に扱う
 */
export type AuthSessionDeleteResponse = {
  cleared: true;
};
