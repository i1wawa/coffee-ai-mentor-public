// apps/web/src/frontend/shared/errors/error-fields-normalize.ts
// ============================================================================
// 概要:
// - unknown の例外を ErrorFields に正規化する
//
// 責務:
// - fetch 由来の例外を ErrorFields（errorId/errorCode）に統一する
// - キャンセル系だけ CANCELLED として扱えるようにする
//
// 契約:
// - 入力: unknown
// - 出力: ErrorFields
// - 既に ErrorFields 形なら透過する
// - Abort は CANCELLED に寄せる
// - それ以外は INTERNAL_ERROR に寄せる
// ============================================================================

import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";

/**
 * ErrorFields らしき形かどうかを判定する
 * - 外部 SDK が投げたものが ErrorFields かもしれないので、最低限だけ見る
 */
function isErrorFieldsLike(value: unknown): value is ErrorFields {
  if (!value || typeof value !== "object") return false;

  const v = value as {
    errorId?: unknown;
    errorCode?: unknown;
  };

  return typeof v.errorId === "string" && typeof v.errorCode === "string";
}

/**
 * 例外などの unknown を ErrorFields に正規化する
 * - UI に返す前に必ず ErrorFields へ落とす
 */
export function normalizeUnknownToErrorFields(error: unknown): ErrorFields {
  // 1) すでに ErrorFields ならそのまま返す
  if (isErrorFieldsLike(error)) {
    return error;
  }

  // 2) AbortError は中断扱いに寄せる
  // - fetch の AbortController
  // - 一部 SDK でも同名の例外が来ることがある（推測）
  if (error instanceof DOMException && error.name === "AbortError") {
    return buildErrorFields(errorCode.CANCELLED);
  }

  // 3) それ以外は想定外として INTERNAL_ERROR に寄せる
  return buildErrorFields(errorCode.INTERNAL_ERROR);
}
