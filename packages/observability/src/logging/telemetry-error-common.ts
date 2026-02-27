// packages/observability/src/logging/telemetry-error-common.ts
// ================================================================
// 概要:
// - request.summary / dependency.call 共通のエラーフィールドと関連ユーティリティ
//
// 責務:
// - errorCode の共通集合（ERROR_CODE）を提供する
// - エラー相関用の errorId と組み合わせたエラーフィールドを定義する
// - エラーフィールドの生成（buildErrorFields）と検証（isErrorCode）を提供する
//
// 契約:
// - errorId はアプリ側で生成する相関ID（問い合わせ・相関に使用）
// - errorCode は UI の復旧行動やログ分類の分岐に使う
// - buildErrorFields は errorId を必ず生成し、error_code は呼び出し側が指定する
//
// 観測:
// - request.summary / dependency.call で同一の errorCode を使い、分類粒度を揃える
// ================================================================

/**
 * request.summary / dependency.call共通のエラーコード
 */
export const errorCode = {
  // 入力値が不正
  VALIDATION_FAILED: "VALIDATION_FAILED",
  // 認証が必要。再サインイン/トークン取得が主な復旧行動。
  AUTH_REQUIRED: "AUTH_REQUIRED",
  // 認証情報が無効。期限切れ・改ざん等。再サインイン/再発行が主な復旧行動
  AUTH_INVALID: "AUTH_INVALID",
  // 権限不足。ユーザー側で解決不能な場合が多いので問い合わせ導線
  ACCESS_DENIED: "ACCESS_DENIED",
  // 対象リソースが存在しない
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  // 競合
  RESOURCE_CONFLICT: "RESOURCE_CONFLICT",
  // 前提条件が満たされない
  PRECONDITION_FAILED: "PRECONDITION_FAILED",
  // レート制限。再試行可。
  RATE_LIMITED: "RATE_LIMITED",
  // クォータ枯渇
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  // クライアント都合で中断。監視ノイズを抑えるため原則想定内扱い、必要ならINFO/NOTICEに
  CANCELLED: "CANCELLED",
  // タイムアウト。再試行可
  DEADLINE_EXCEEDED: "DEADLINE_EXCEEDED",
  // 一時障害/上流利用不能。再試行可
  UNAVAILABLE: "UNAVAILABLE",
  // 未実装/非対応。代替手段があるならUIで案内
  UNIMPLEMENTED: "UNIMPLEMENTED",
  // 想定外の内部エラー
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/**
 * request.summary / dependency.call共通のエラーコード
 */
export type ErrorCode = (typeof errorCode)[keyof typeof errorCode];

/**
 * エラー時のみ付与するフィールド
 *
 * - request.summary / dependency.call共通
 * - UIの挙動分岐や問い合わせ用IDに使う
 */
export type ErrorFields = {
  // アプリ側で生成するエラー用相関ID（UUIDv7等）
  //  問い合わせ用IDに使う
  errorId: string;
  // エラーコード（request.summary / dependency.call共通）
  // UIの挙動分岐に使う
  errorCode: ErrorCode;
};

/**
 * 失敗時 error_fields を 作る
 * - errorId はここで必ず生成
 * - errorCode は呼び出し側が必ず指定（型で必須）
 */
export function buildErrorFields(errorCode: ErrorCode): ErrorFields {
  return {
    errorId: crypto.randomUUID(), // UUIDv7等に差し替え可
    errorCode,
  };
}

// ErrorCodeの検証用
const ERROR_CODE_VALUES = new Set(Object.values(errorCode));
export const isErrorCode = (v: unknown): v is ErrorCode =>
  typeof v === "string" && ERROR_CODE_VALUES.has(v as ErrorCode);

/**
 * ErrorFieldsの検証用
 */
export function isErrorFields(v: unknown): v is ErrorFields {
  if (typeof v !== "object" || v === null) return false;
  const record = v as Record<string, unknown>;
  return typeof record.errorId === "string" && isErrorCode(record.errorCode);
}
