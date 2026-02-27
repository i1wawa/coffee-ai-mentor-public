// apps/web/src/frontend/shared/errors/ui-error-presentation.ts
// ================================================================
// 概要:
// - UI_ERROR_ACTION ごとの文言と表示ルールを共通化する
//
// 責務:
// - 画面側の if 分岐を最小化する
// - 文言、サポートID表示、問い合わせ導線を 1 箇所に集約する
// ================================================================

import {
  UI_ERROR_ACTION,
  type UiErrorAction,
  type UiErrorFields,
} from "./error-ui-action.mapper";

type UiErrorContact = {
  label: string;
  href: string;
};

type UiErrorPresentation = {
  // UI にエラー表示するか（サポートIDの有無に関わらず）
  shouldDisplay: boolean;
  // エラーの存在をユーザーに伝えるタイトル
  title: string | null;
  // エラーの対応方法をユーザーに伝える文言
  description: string | null;
  // エラーIDの表示が必要な場合は supportId に値が入る
  supportId: string | null;
  // 将来的に問い合わせ導線が増える可能性を考慮して contact フィールドを用意する
  contact: UiErrorContact | null;
};

type UiErrorPresentationWithoutSupportId = Omit<
  UiErrorPresentation,
  "supportId"
>;

const UI_ERROR_PRESENTATION_BY_ACTION: Record<
  UiErrorAction,
  UiErrorPresentationWithoutSupportId
> = {
  [UI_ERROR_ACTION.SIGN_IN]: {
    shouldDisplay: false,
    title: null,
    description: null,
    contact: null,
  },
  [UI_ERROR_ACTION.RETRY]: {
    shouldDisplay: true,
    title: "失敗しました",
    description: "時間をおいて再度お試しください。",
    contact: null,
  },
  [UI_ERROR_ACTION.SUPPORT]: {
    shouldDisplay: true,
    title: "失敗しました",
    description: "お手数ですが、サポートへお問い合わせください。",
    contact: null,
  },
  [UI_ERROR_ACTION.OTHER]: {
    shouldDisplay: true,
    title: "失敗しました",
    description: "入力内容をご確認のうえ、再度お試しください。",
    contact: null,
  },
  [UI_ERROR_ACTION.SILENT]: {
    shouldDisplay: false,
    title: null,
    description: null,
    contact: null,
  },
};

export function getUiErrorPresentation(
  error: UiErrorFields,
): UiErrorPresentation {
  const presentation = UI_ERROR_PRESENTATION_BY_ACTION[error.uiErrorAction];
  return {
    ...presentation,
    supportId:
      error.uiErrorAction === UI_ERROR_ACTION.SUPPORT ? error.errorId : null,
  };
}
