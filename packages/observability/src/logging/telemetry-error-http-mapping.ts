// packages/observability/src/logging/telemetry-error-http-mapping.ts
// ================================================================
// 概要:
// - ErrorCode を HTTP status に写像する
//
// 前提:
// - status は「原因（errorCode）」の分類を粗く表す。エンドポイント固有の仕様はここに入れない。
// - 499 は非標準（クライアント中断の表現として採用）
//
// 位置づけ（アーキテクチャ）:
// - observability 共通ユーティリティ。HTTP境界とログ出力の双方から参照される。
//
// 観測:
// - request.summary の status 一貫性を保つための基準表。
// ================================================================

import { type ErrorCode, errorCode } from "./telemetry-error-common";

/**
 * errorCode（原因）を HTTP status（見せ方）に変換する
 * - request.summary の擬似 status
 * - 例外（throw）時の status 推定
 * に使う
 */
export function mapErrorCodeToHttpStatusCode(code: ErrorCode): number {
  switch (code) {
    // 入力不正
    case errorCode.VALIDATION_FAILED:
      return 400;

    // 認証が必要
    case errorCode.AUTH_REQUIRED:
    // 認証情報が無効。期限切れ・改ざん等
    case errorCode.AUTH_INVALID:
      return 401;

    // 権限不足
    case errorCode.ACCESS_DENIED:
      return 403;

    // 対象リソースが存在しない
    case errorCode.RESOURCE_NOT_FOUND:
      return 404;

    // 競合
    case errorCode.RESOURCE_CONFLICT:
      return 409;

    // 前提条件NG
    case errorCode.PRECONDITION_FAILED:
      return 412;

    // レート制限
    case errorCode.RATE_LIMITED:
    // クォータ枯渇
    case errorCode.QUOTA_EXCEEDED:
      return 429;

    // クライアント都合で中断
    case errorCode.CANCELLED:
      return 499; // （非標準）

    // タイムアウト
    case errorCode.DEADLINE_EXCEEDED:
      return 504;

    // 一時障害/上流利用不能
    case errorCode.UNAVAILABLE:
      return 503;

    // 未実装/非対応
    case errorCode.UNIMPLEMENTED:
      return 501;

    // 想定外の内部エラー
    case errorCode.INTERNAL_ERROR:
      return 500;

    default: {
      // 想定外の errorCode が来た場合、500を返す
      const _exhaustive: never = code;
      return 500;
    }
  }
}

export function mapHttpStatusCodeToErrorCode(status: number): ErrorCode {
  // 1) よくある代表コードだけを明示分類する
  // 2) それ以外は 4xx=VALIDATION_FAILED, 5xx=INTERNAL_ERROR に寄せる
  switch (status) {
    case 400:
      return errorCode.VALIDATION_FAILED;

    case 401:
      // 401 は AUTH_REQUIRED に寄せる
      // - AUTH_INVALID と区別できないため、UI行動としては再サインイン誘導が同じになりやすい
      return errorCode.AUTH_REQUIRED;

    case 403:
      return errorCode.ACCESS_DENIED;

    case 404:
      return errorCode.RESOURCE_NOT_FOUND;

    case 409:
      return errorCode.RESOURCE_CONFLICT;

    case 412:
      return errorCode.PRECONDITION_FAILED;

    case 429:
      // 429 は RATE_LIMITED に寄せる
      // - QUOTA_EXCEEDED と区別できないため、UI行動としては同じになりやすい
      return errorCode.RATE_LIMITED;

    case 499:
      return errorCode.CANCELLED;

    case 501:
      return errorCode.UNIMPLEMENTED;

    case 503:
      return errorCode.UNAVAILABLE;

    case 504:
      return errorCode.DEADLINE_EXCEEDED;

    default: {
      // 3) 5xx は基本 INTERNAL_ERROR
      if (status >= 500) return errorCode.INTERNAL_ERROR;

      // 4) 4xx は基本 VALIDATION_FAILED に寄せる
      if (status >= 400) return errorCode.VALIDATION_FAILED;

      // 5) 想定外は INTERNAL_ERROR
      return errorCode.INTERNAL_ERROR;
    }
  }
}
