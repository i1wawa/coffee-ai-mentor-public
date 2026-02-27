// apps/web/src/frontend/shared/errors/ui-result.ts
// ============================================================================
// 概要:
// - model の Result を UI 向け UiResult に統一する境界ヘルパ
//
// 責務:
// - Result<T, TelemetryErrorFields> を UiResult<T> に変換する
// ============================================================================

import type { ErrorFields } from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import { toUiErrorFields, type UiErrorFields } from "./error-ui-action.mapper";
import {
  type ModelResult,
  sanitizeToErrorFields,
} from "./telemetry-error-result";

/**
 * model から UI へ返す統一 Result
 */
export type UiResult<T> = Result<T, UiErrorFields>;

/**
 * ModelErrorFields を UiResult に変換する
 * - UI へは拡張フィールドを絶対に渡さない
 */
export function toUiResult<T>(result: ModelResult<T>): UiResult<T> {
  if (result.ok) return ok(result.value);

  // 1) UI へ返す前に sanitize する
  // - cause や sdk を落とし、契約を守る
  const safe: ErrorFields = sanitizeToErrorFields(result.error);

  // 2) ErrorFields -> UiErrorFields へ変換
  return err(toUiErrorFields(safe));
}
