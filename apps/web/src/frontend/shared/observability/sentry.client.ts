// apps/web/src/frontend/shared/errors/sentry.client.ts
// ============================================================================
// 概要:
// - ErrorFields を Sentry に送る最小ヘルパ（送信判定つき）
//
// 責務:
// - operation / layer / errorCode を tags に統一して付与する
// - errorId を context に付与し、検索と突合をしやすくする
// - 送信基準を 1 箇所に集約してノイズを抑える
//
// 契約:
// - 送信する: INTERNAL_ERROR のみ
// - 送信しない: CANCELLED を含むその他
// - cause が無い場合は代替 Error を送って送信地点の stack を残す
// ============================================================================

import {
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { captureException, withScope } from "@sentry/nextjs";
import {
  sanitizeToErrorFields,
  type TelemetryErrorFields,
} from "../errors/telemetry-error-result";
import type { TelemetryLayer, TelemetryOperation } from "./telemetry-tags";

export const SENTRY_FALLBACK_ERROR_MESSAGE =
  "handled_model_error_fields_without_cause";

/**
 * 例外を Sentry に送るかどうか（想定内/想定外の分離）
 * - errorCode が INTERNAL_ERROR（または不明）を「想定外」とみなし送信する
 * - それ以外の errorCode は「想定内」とみなし原則送信しない
 */
export function shouldCaptureToSentry(error: ErrorFields): boolean {
  // 1) backend と揃える: INTERNAL_ERROR（または不明）だけ送る
  // - CANCELLED は送らない
  // - それ以外（AUTH_REQUIRED など）は原則送らない
  return error.errorCode === errorCode.INTERNAL_ERROR;
}

/**
 * Sentry へ送る
 * - stack を優先して cause を送る
 * - cause が無い場合は送信地点 stack になるが、最低限の追跡はできる
 */
export function captureErrorToSentry(args: {
  operation: TelemetryOperation;
  layer: TelemetryLayer;
  error: TelemetryErrorFields;
}): void {
  const safe: ErrorFields = sanitizeToErrorFields(args.error);

  // 1) INTERNAL_ERROR 以外は送らない
  if (!shouldCaptureToSentry(safe)) return;

  // 2) Sentry scope に検索用情報を付与する
  withScope((scope) => {
    // 2-1) 低カーディナリティ tags
    scope.setTag("operation", args.operation);
    scope.setTag("layer", args.layer);
    scope.setTag("error_code", safe.errorCode);

    // 2-2) 高カーディナリティ contexts
    scope.setContext("app_error", { error_id: safe.errorId });

    // 2-3) SDK メタがあれば contexts に入れる
    if (args.error.sdk) {
      scope.setContext("sdk_meta", {
        provider: args.error.sdk.provider,
        code: args.error.sdk.code,
        name: args.error.sdk.name,
      });
    }

    // 3) stack が取れるなら cause を送る
    // - Error でない object の場合もあるため、そのまま送る
    // - 必要なら normalizeUnknownToError で Error 化する運用もあり（推測）
    if (args.error.cause) {
      captureException(args.error.cause);
      return;
    }

    // 4) cause が無い場合は代替 Error を送る
    captureException(new Error(SENTRY_FALLBACK_ERROR_MESSAGE));
  });
}
