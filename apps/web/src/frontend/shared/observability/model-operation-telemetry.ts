// apps/web/src/frontend/shared/observability/model-operation-telemetry.ts
// ============================================================================
// 概要:
// - model 層の操作を安全に実行し、Sentry 送信も一括管理するラッパ
//
// 責務:
// - 例外キャッチと UiResult への変換
// - 失敗時の Sentry 送信判定と送信処理
// ============================================================================

import { buildErrorFields } from "@packages/observability/src/logging/telemetry-error-common";
import { err } from "@packages/shared/src/result";
import { normalizeUnknownToErrorFields } from "../errors/error-fields.normalize";
import { toUiErrorFields } from "../errors/error-ui-action.mapper";
import {
  type ModelResult,
  sanitizeToErrorFields,
  type TelemetryErrorFields,
} from "../errors/telemetry-error-result";
import { toUiResult, type UiResult } from "../errors/ui-result";
import { captureErrorToSentry } from "./sentry.client";
import { TELEMETRY_LAYER, type TelemetryOperation } from "./telemetry-tags";

/**
 * model 用の安全実行ラッパ
 * - Sentry 送信もここで一括管理する
 * - 返り値が ModelResult<T> の関数を受け取り、UiResult<T> に変換する
 * - 例外が飛んでも UiResult<T> に畳み込む
 */
export async function runModelOperationWithTelemetry<T>(args: {
  operation: TelemetryOperation;
  fn: () => Promise<ModelResult<T>>;
}): Promise<UiResult<T>> {
  try {
    // 1) model 本体を実行する
    const result = await args.fn();

    // 2) ModelResult.ok false のうち、送るべきものだけ Sentry へ送る
    if (!result.ok) {
      captureErrorToSentry({
        operation: args.operation,
        layer: TELEMETRY_LAYER.MODEL,
        error: result.error,
      });
    }

    // 3) ErrorFields -> UiErrorFields へ変換する
    return toUiResult(result);
  } catch (e) {
    // 4) throw は unknown を ErrorFields に正規化する
    const normalized = normalizeUnknownToErrorFields(e);

    // 5) throw 経路でも Sentry 送信を統一する
    // - 判定（INTERNAL_ERROR だけ送る）と tag/context 付与を captureModelErrorToSentry に寄せる
    // - cause に元例外を入れて stack を優先する
    const safeForModel: TelemetryErrorFields = {
      ...(normalized.errorId
        ? normalized
        : buildErrorFields(normalized.errorCode)),
      cause: e,
    };
    captureErrorToSentry({
      operation: args.operation,
      layer: TELEMETRY_LAYER.MODEL,
      error: safeForModel,
    });

    // 6) UI へ返すため、ErrorFields を作る
    const safe = sanitizeToErrorFields(safeForModel);

    return err(toUiErrorFields(safe));
  }
}
