// apps/web/src/frontend/shared/errors/telemetry-error-result.ts
// ============================================================================
// 概要:
// - SDK 例外を Result で扱うための拡張 ErrorFields とヘルパ
//
// 責務:
// - SDK 例外を Result で扱うための拡張フィールドを保持する
// - Sentry 送信時に stack を保持できる形を提供する
//
// 契約:
// - UI へ返す際は sanitize された ErrorFields（errorId / errorCode のみ）を使う
// - 拡張フィールド（cause / sdk）は境界を越えない
// ============================================================================

import type { ErrorFields } from "@packages/observability/src/logging/telemetry-error-common";
import type { Result } from "@packages/shared/src/result";
import type { TelemetryOperation } from "../observability/telemetry-tags";

export type TelemetrySdkMeta = {
  // 1) 低カーディナリティな識別子だけを入れる
  provider: "firebase_auth" | "unknown";
  // 2) 代表的な code 程度は許容
  // - ただし増えすぎるなら contexts に限定する運用へ寄せる（推測）
  code?: string;
  // 3) name も有限集合になりやすいので許容
  name?: string;
  // 4) どの操作で起きたか
  // - 同じ code でも、signIn と link で復旧行動が変わることがある
  // - 低カーディナリティな operation に限定する
  operation?: TelemetryOperation;
};

export type TelemetryErrorFields = ErrorFields & {
  // 1) 元例外を保持する
  // - Sentry へ送るときに stack を使う
  // - UI へは絶対に渡さない
  cause?: unknown;
  // 2) SDK 由来の追加メタ
  sdk?: TelemetrySdkMeta;
};

/**
 * model 内で使う共通 Result
 * - api 由来と sdk 由来のどちらでも使える
 * - cause の stack を Sentry 送信に使う前提
 */
export type ModelResult<T> = Result<T, TelemetryErrorFields>;

/**
 * UI へ返すために ErrorFields を sanitize する
 * - 拡張フィールドを落とし、契約を汚さない
 */
export function sanitizeToErrorFields(
  error: TelemetryErrorFields,
): ErrorFields {
  return {
    errorId: error.errorId,
    errorCode: error.errorCode,
  };
}
