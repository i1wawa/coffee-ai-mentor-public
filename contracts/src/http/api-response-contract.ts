// contracts/src/http/api-response-contract.ts
// ================================================================
// 概要:
// - APIレスポンス共通契約（envelope）。
// - Route Handler / Server Action どちらでも同じ形に統一する。
//
// 責務:
// - 成功/失敗を ok フラグで一意に判定できる共通レスポンス形を提供する。
// - 失敗時の error を observability の ErrorFields と同一形に固定する。
//
// 契約:
// - 成功: ok=true かつ data を返す。
// - 失敗: ok=false かつ error を必ず返す。
// - ok=false で error が無いレスポンスは禁止（調査不能になる）。
// - error は ErrorFields（errorId / errorCode）をそのまま使う。
//   - エラーコードの二重定義を避ける。
// ================================================================

import type { ErrorFields } from "@packages/observability/src/logging/telemetry-error-common";

/**
 * 成功レスポンス。
 * - data: エンドポイントごとの結果
 */
export type ApiOkResponse<TData> = {
  ok: true;
  data: TData;
};

/**
 * 失敗レスポンス。
 * - error は必須
 * - error の形は observability と完全一致させる
 */
export type ApiErrorResponse = {
  ok: false;
  error: ErrorFields;
};

/**
 * APIレスポンス共通型。
 */
export type ApiResponse<TData> = ApiOkResponse<TData> | ApiErrorResponse;
