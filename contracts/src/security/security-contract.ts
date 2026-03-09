// contracts/src/security/security-contract.ts
// ========================================================
// 概要:
// - Security 系 API の HTTP 契約（共通）
// - クライアント非依存で、apps/web（Route Handler / Proxy）とテストから参照される
//
// 責務:
// - security 系エンドポイントの相対パス・受理 Content-Type を 1 箇所に集約し、参照側のズレを防ぐ
// ========================================================

/**
 * security 関連 API の相対パス（BFF内）
 * - Route Handler の実装やテストで共有する
 * - パス変更時に、参照側の修正点を局所化する
 */
export const SECURITY_PATHS = {
  cspReport: "/api/security/csp-report",
} as const;

/**
 * CSP違反レポート API が受理する Content-Type
 * - legacy: report-uri 形式
 * - modern: report-to 形式
 */
export const CSP_REPORT_CONTENT_TYPES = {
  legacy: "application/csp-report",
  modern: "application/reports+json",
} as const;

/**
 * CSP違反レポート API の固定レスポンス status
 * - 既知/未知の入力を問わず、常に 204（No Content）で終える
 */
export const CSP_REPORT_NO_CONTENT_STATUS = 204;
