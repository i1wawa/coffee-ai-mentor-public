// apps/web/src/frontend/shared/errors/error-ui-action.mapper.ts
// ================================================================
// 概要:
// - ErrorCode を UI の復旧行動カテゴリ（UiErrorAction）へ写像する
//
// 責務:
// - errorCode 分岐を各画面に散らさず、このファイルに集約する
// - UI が選ぶ復旧導線を少数カテゴリに正規化する
//
// 前提:
// - backend は errorId と errorCode のみを返す
// - UI は uiErrorAction を見て復旧導線を切り替える
// ================================================================

import {
  type ErrorCode,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";

/**
 * UI が次に取るべき行動カテゴリ
 */
export const UI_ERROR_ACTION = {
  // 未ログイン/無効セッションの導線
  SIGN_IN: "sign_in",
  // 一時障害/上限の再試行導線
  RETRY: "retry",
  // ユーザー側で解決しにくい導線（サポートID提示など）
  SUPPORT: "support",
  // 画面固有の扱い（入力不正/競合/見つからない等）
  OTHER: "other",
  // 通知しない（ユーザー操作の中断など）
  SILENT: "silent",
} as const;

export type UiErrorAction =
  (typeof UI_ERROR_ACTION)[keyof typeof UI_ERROR_ACTION];

// model から ui に返すための統一エラー型
// - backend 契約の ErrorFields に復旧カテゴリを足す
export type UiErrorFields = ErrorFields & {
  uiErrorAction: UiErrorAction;
};

/**
 * ErrorCode を UI の復旧行動カテゴリに写像する。
 */
export function mapErrorCodeToUiErrorAction(code: ErrorCode): UiErrorAction {
  // 1) 通知を出さない（ユーザー操作の中断など）
  if (code === errorCode.CANCELLED) {
    return UI_ERROR_ACTION.SILENT;
  }

  // 2) 未ログイン導線
  // - 認証が無い/無効（期限切れ/改ざんなど）
  if (code === errorCode.AUTH_REQUIRED || code === errorCode.AUTH_INVALID) {
    return UI_ERROR_ACTION.SIGN_IN;
  }

  // 3) 再試行導線
  // - 一時障害や上限で、時間を置いた再試行が筋
  if (
    code === errorCode.UNAVAILABLE ||
    code === errorCode.DEADLINE_EXCEEDED ||
    code === errorCode.RATE_LIMITED ||
    code === errorCode.QUOTA_EXCEEDED
  ) {
    return UI_ERROR_ACTION.RETRY;
  }

  // 4) 問い合わせ/汎用エラー導線
  // - ユーザー操作での解決が難しい
  if (
    code === errorCode.INTERNAL_ERROR ||
    code === errorCode.ACCESS_DENIED ||
    code === errorCode.UNIMPLEMENTED
  ) {
    return UI_ERROR_ACTION.SUPPORT;
  }

  // 5) 画面固有の扱いが多い
  if (
    code === errorCode.VALIDATION_FAILED ||
    code === errorCode.RESOURCE_NOT_FOUND ||
    code === errorCode.RESOURCE_CONFLICT
  ) {
    return UI_ERROR_ACTION.OTHER;
  }

  // 6) 想定外は SUPPORT に寄せる
  // - 迷ったときに再認証や再試行へ誤誘導しない
  return UI_ERROR_ACTION.SUPPORT;
}

/**
 * ErrorFields に uiErrorAction を付与する。
 * - model はこれを使って UiErrorFields に統一して返す
 */
export function toUiErrorFields(error: ErrorFields): UiErrorFields {
  // 1) 既存の ErrorFields を壊さずにそのまま残す
  // 2) ui 側が分岐に使える復旧カテゴリを付ける
  return {
    ...error,
    uiErrorAction: mapErrorCodeToUiErrorAction(error.errorCode),
  };
}
