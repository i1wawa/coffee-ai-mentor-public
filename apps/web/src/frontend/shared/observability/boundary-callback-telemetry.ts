// apps/web/src/frontend/shared/observability/boundary-callback-telemetry.ts
// ============================================================================
// 概要:
// - バウンダリーコールバック内で発生した例外を安全にキャッチし、Sentry 送信も行うラッパ
//
// 責務:
// - 例外キャッチと UiResult への変換
// - 失敗時の Sentry 送信判定と送信処理
// ============================================================================

import { buildErrorFields } from "@packages/observability/src/logging/telemetry-error-common";
import { normalizeUnknownToErrorFields } from "../errors/error-fields.normalize";
import type { TelemetryErrorFields } from "../errors/telemetry-error-result";
import { captureErrorToSentry } from "./sentry.client";
import type { TelemetryLayer, TelemetryOperation } from "./telemetry-tags";

/**
 * バウンダリーコールバック用の安全実行ラッパ
 * - Sentry 送信もここで一括管理する
 * - 返り値は void
 * - 例外が飛んでも握りつぶして処理を継続する
 */
export async function runBoundaryCallbackWithTelemetry(args: {
  operation: TelemetryOperation;
  layer: TelemetryLayer;
  fn: () => void | Promise<void>;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    // 1) boundary callback 本体を実行する
    await args.fn();
  } catch (e) {
    // 2) エラーの正規化
    const normalized = normalizeUnknownToErrorFields(e);

    // 3) throw 経路でも Sentry 送信を統一する
    const safeForModel: TelemetryErrorFields = {
      ...(normalized.errorId
        ? normalized
        : buildErrorFields(normalized.errorCode)),
      cause: e,
    };

    // 4) Sentry への送信
    captureErrorToSentry({
      operation: args.operation,
      layer: args.layer,
      error: safeForModel,
    });
  }
}
