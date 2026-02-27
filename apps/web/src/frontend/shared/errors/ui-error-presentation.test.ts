// apps/web/src/frontend/shared/errors/ui-error-presentation.test.ts
// ================================================================
// 概要:
// - UI_ERROR_ACTION ごとの表示契約を固定するユニットテスト
//
// 契約:
// - RETRY は再試行メッセージを表示する
// - SUPPORT は問い合わせIDを表示する
// - OTHER は入力確認メッセージを表示する
// - 問い合わせ導線は contact に集約する
// - SIGN_IN / SILENT はエラー表示を出さない
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { describe, expect, it } from "vitest";
import { toUiErrorFields } from "./error-ui-action.mapper";
import { getUiErrorPresentation } from "./ui-error-presentation";

describe("getUiErrorPresentation", () => {
  it("RETRY は再試行文言を表示する", () => {
    const retryError = toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE));

    const presentation = getUiErrorPresentation(retryError);

    expect(presentation.shouldDisplay).toBe(true);
    expect(presentation.title).toBe("失敗しました");
    expect(presentation.description).toBe("時間をおいて再度お試しください。");
    expect(presentation.supportId).toBeNull();
    expect(presentation.supportId).not.toBe(retryError.errorId);
    expect(presentation.contact).toBeNull();
  });

  it("SUPPORT は問い合わせIDを表示する", () => {
    const supportError = toUiErrorFields(
      buildErrorFields(errorCode.INTERNAL_ERROR),
    );

    const presentation = getUiErrorPresentation(supportError);

    expect(presentation.shouldDisplay).toBe(true);
    expect(presentation.title).toBe("失敗しました");
    expect(presentation.supportId).toBe(supportError.errorId);
    expect(presentation.contact).toBeNull();
  });

  it("OTHER は入力確認メッセージを表示する", () => {
    const otherError = toUiErrorFields(
      buildErrorFields(errorCode.RESOURCE_CONFLICT),
    );

    const presentation = getUiErrorPresentation(otherError);

    expect(presentation.shouldDisplay).toBe(true);
    expect(presentation.title).toBe("失敗しました");
    expect(presentation.description).toBe(
      "入力内容をご確認のうえ、再度お試しください。",
    );
    expect(presentation.supportId).toBeNull();
    expect(presentation.supportId).not.toBe(otherError.errorId);
    expect(presentation.contact).toBeNull();
  });

  it("SIGN_IN はエラー表示を出さない", () => {
    const signInError = toUiErrorFields(
      buildErrorFields(errorCode.AUTH_REQUIRED),
    );

    const presentation = getUiErrorPresentation(signInError);

    expect(presentation.shouldDisplay).toBe(false);
    expect(presentation.title).toBeNull();
    expect(presentation.description).toBeNull();
    expect(presentation.supportId).toBeNull();
    expect(presentation.supportId).not.toBe(signInError.errorId);
    expect(presentation.contact).toBeNull();
  });

  it("SILENT はエラー表示を出さない", () => {
    const silentError = toUiErrorFields(buildErrorFields(errorCode.CANCELLED));

    const presentation = getUiErrorPresentation(silentError);

    expect(presentation.shouldDisplay).toBe(false);
    expect(presentation.title).toBeNull();
    expect(presentation.description).toBeNull();
    expect(presentation.supportId).toBeNull();
    expect(presentation.supportId).not.toBe(silentError.errorId);
    expect(presentation.contact).toBeNull();
  });
});
