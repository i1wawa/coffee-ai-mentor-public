// contracts/src/users/users-contract.ts
// ========================================================
// 概要:
// - ユーザー情報・アカウント操作の HTTP 契約（共通）
// - クライアント非依存で、apps/web（Route Handler / Server Actions / Proxy）とテストから参照される
//
// 責務:
// - users 系エンドポイントの相対パス・DTO を 1 箇所に集約し、参照側のズレを防ぐ
//
// 契約:
// - Web は Firebase セッション Cookie を主軸にする
// - GET /api/users/me は保護リソース取得のため、未サインインは 401 を返す
// - DELETE /api/users/me は cookie のみで実行する（body は送らない）
//
// セキュリティ/機微情報:
// - token / cookie などの機微値は、この契約に載せない方針とする
// ========================================================

/**
 * users 関連 API の相対パス（BFF内）
 * - Route Handler の実装やテストで共有する
 * - パス変更時に、参照側の修正点を局所化する
 */
export const USER_PATHS = {
  me: "/api/users/me",
} as const;

/**
 * 自分の情報（GET /api/users/me）の Response
 *
 * 注意:
 * - 現状は uid のみ
 * - 将来プロフィール情報を追加するときも、後方互換を意識して段階的に拡張する
 */
export type UserMeResponse = {
  uid: string;
};

/**
 * アカウント削除（DELETE /api/users/me）の成功 Response
 *
 * 注意:
 * - 危険操作のため、サーバは recent login などの前提条件で 412 を返し得る
 * - 再認証の入力（idToken等）はこのAPIに混ぜず、別API（session再発行）へ寄せる
 * - 成功時は削除 Set-Cookie を返し、この端末を確実にサインアウトさせる
 */
export type UserMeDeleteResponse = {
  deleted: true;
};
