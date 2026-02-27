// apps/web/src/frontend/shared/errors/error-ui-action.mapper.test.ts
// ================================================================
// 概要:
// - error-ui-action.mapper のユニットテスト
//
// 契約:
// - ErrorCode を UiErrorAction へ正しく分類する
// - toUiErrorFields は ErrorFields を壊さず uiErrorAction を付与する
// ================================================================

import {
  type ErrorCode,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { describe, expect, it } from "vitest";
import {
  mapErrorCodeToUiErrorAction,
  toUiErrorFields,
  UI_ERROR_ACTION,
} from "./error-ui-action.mapper";

describe("mapErrorCodeToUiErrorAction", () => {
  // 公式ドキュメントの推奨どおり it.each で分類表を固定する（公式推奨）
  it.each([
    { code: errorCode.CANCELLED, expected: UI_ERROR_ACTION.SILENT },
    { code: errorCode.AUTH_REQUIRED, expected: UI_ERROR_ACTION.SIGN_IN },
    { code: errorCode.AUTH_INVALID, expected: UI_ERROR_ACTION.SIGN_IN },
    { code: errorCode.UNAVAILABLE, expected: UI_ERROR_ACTION.RETRY },
    { code: errorCode.DEADLINE_EXCEEDED, expected: UI_ERROR_ACTION.RETRY },
    { code: errorCode.RATE_LIMITED, expected: UI_ERROR_ACTION.RETRY },
    { code: errorCode.QUOTA_EXCEEDED, expected: UI_ERROR_ACTION.RETRY },
    { code: errorCode.INTERNAL_ERROR, expected: UI_ERROR_ACTION.SUPPORT },
    { code: errorCode.ACCESS_DENIED, expected: UI_ERROR_ACTION.SUPPORT },
    { code: errorCode.UNIMPLEMENTED, expected: UI_ERROR_ACTION.SUPPORT },
    { code: errorCode.VALIDATION_FAILED, expected: UI_ERROR_ACTION.OTHER },
    { code: errorCode.RESOURCE_NOT_FOUND, expected: UI_ERROR_ACTION.OTHER },
    { code: errorCode.RESOURCE_CONFLICT, expected: UI_ERROR_ACTION.OTHER },
  ])("$code は $expected に分類する", ({ code, expected }) => {
    // 1) act: ErrorCode を UI 行動カテゴリへ写像する
    const uiErrorAction = mapErrorCodeToUiErrorAction(code);

    // 2) assert: 想定カテゴリに分類される
    expect(uiErrorAction).toBe(expected);
  });

  it("明示分岐にない ErrorCode は SUPPORT に寄せる", () => {
    // 1) arrange: 明示分岐にないが型上は有効なコードを用意する
    const fallbackCode: ErrorCode = errorCode.PRECONDITION_FAILED;

    // 2) act: UI 行動カテゴリへ写像する
    const uiErrorAction = mapErrorCodeToUiErrorAction(fallbackCode);

    // 3) assert: フォールバック分類になる
    expect(uiErrorAction).toBe(UI_ERROR_ACTION.SUPPORT);
  });
});

describe("toUiErrorFields", () => {
  it("ErrorFields を壊さず uiErrorAction を付与する", () => {
    // 1) arrange: 元の ErrorFields を固定値で作る
    const originalError: ErrorFields = {
      errorId: "e_test_mapper_001",
      errorCode: errorCode.AUTH_REQUIRED,
    };

    // 2) act: UI 向け ErrorFields へ変換する
    const uiError = toUiErrorFields(originalError);

    // 3) assert: 元フィールドを維持しつつ分類結果が付く
    expect(uiError).toEqual({
      ...originalError,
      uiErrorAction: UI_ERROR_ACTION.SIGN_IN,
    });
  });
});
