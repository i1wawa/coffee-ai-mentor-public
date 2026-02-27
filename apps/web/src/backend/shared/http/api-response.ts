// apps/web/src/backend/shared/http/api-response.ts
// ================================================================
// 概要:
// - Next.js バックエンド用の API レスポンス body 生成ヘルパ
//
// 責務:
// - contracts の ApiResponse 形状（ok/data/error）を満たす body を生成する
// - ErrorFields をそのまま error として返す
// ================================================================

import type {
  ApiErrorResponse,
  ApiOkResponse,
} from "@contracts/src/http/api-response-contract";
import type { ErrorFields } from "@packages/observability/src/logging/telemetry-error-common";

/**
 * 成功レスポンスbodyを作る。
 */
export function buildApiOkBody<TData>(data: TData): ApiOkResponse<TData> {
  return { ok: true, data };
}

/**
 * 失敗レスポンスbodyを作る。
 * - ok=false のとき error を必須化するため、この関数経由を推奨
 */
export function buildApiErrorBody(error: ErrorFields): ApiErrorResponse {
  return { ok: false, error };
}
