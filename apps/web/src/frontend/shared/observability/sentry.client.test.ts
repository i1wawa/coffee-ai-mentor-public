// apps/web/src/frontend/shared/observability/sentry.client.test.ts
// ===============================================================
// 概要:
// - shouldCaptureToSentry と captureModelErrorToSentry のユニットテスト
//
// 契約:
// - INTERNAL_ERROR のみ送信対象にする
// - tag と context を必ず付与する
// - cause があればそれを送る
// - cause が無い場合は代替 Error を送る
// ===============================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { captureException, withScope } from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelemetryErrorFields } from "../errors/telemetry-error-result";
import {
  captureErrorToSentry,
  SENTRY_FALLBACK_ERROR_MESSAGE,
  shouldCaptureToSentry,
} from "./sentry.client";
import { TELEMETRY_LAYER, TELEMETRY_OPERATION } from "./telemetry-tags";

type SentryScope = {
  setTag: ReturnType<typeof vi.fn>;
  setContext: ReturnType<typeof vi.fn>;
};

vi.mock("@sentry/nextjs", () => {
  return {
    captureException: vi.fn(),
    withScope: vi.fn(),
  };
});

describe("sentry.client", () => {
  const mockedCaptureException = vi.mocked(captureException);
  const mockedWithScope = vi.mocked(withScope);
  const scope: SentryScope = {
    setTag: vi.fn(),
    setContext: vi.fn(),
  };

  const invokeWithScopeCallback = () => {
    const callback = mockedWithScope.mock.calls[0]?.[0] as unknown;
    if (typeof callback !== "function") {
      throw new Error("withScope callback was not provided");
    }
    callback(scope);
  };

  beforeEach(() => {
    // 1) テスト間の干渉を防ぐ
    mockedCaptureException.mockReset();
    mockedWithScope.mockReset();
    scope.setTag.mockReset();
    scope.setContext.mockReset();
  });

  it("INTERNAL_ERROR 以外は送信しない", () => {
    // 1) arrange: CANCELLED の error を作る
    const error = buildErrorFields(errorCode.CANCELLED);

    // 2) act: 送信する
    captureErrorToSentry({
      operation: TELEMETRY_OPERATION.SIGN_OUT,
      layer: TELEMETRY_LAYER.MODEL,
      error,
    });

    // 3) assert: 送信は行われない
    expect(mockedWithScope).toHaveBeenCalledTimes(0);
    expect(mockedCaptureException).toHaveBeenCalledTimes(0);
  });

  it("shouldCaptureToSentry は INTERNAL_ERROR のみ true", () => {
    // 1) arrange: ErrorFields を用意する
    const internal = buildErrorFields(errorCode.INTERNAL_ERROR);
    const cancelled = buildErrorFields(errorCode.CANCELLED);

    // 2) assert: INTERNAL_ERROR だけ true
    expect(shouldCaptureToSentry(internal)).toBe(true);
    expect(shouldCaptureToSentry(cancelled)).toBe(false);
  });

  it("INTERNAL_ERROR は tag と context を付与して cause を送る", () => {
    // 1) arrange: cause と sdk を含む error を作る
    const cause = new Error("boom");
    const error: TelemetryErrorFields = {
      ...buildErrorFields(errorCode.INTERNAL_ERROR),
      cause,
      sdk: {
        provider: "firebase_auth",
        code: "auth/error",
        name: "AuthError",
        operation: TELEMETRY_OPERATION.SIGN_OUT,
      },
    };

    // 2) act: 送信する
    captureErrorToSentry({
      operation: TELEMETRY_OPERATION.SIGN_OUT,
      layer: TELEMETRY_LAYER.SDK,
      error,
    });
    invokeWithScopeCallback();

    // 3) assert: scope が設定される
    expect(mockedWithScope).toHaveBeenCalledTimes(1);
    expect(scope.setTag).toHaveBeenCalledWith(
      "operation",
      TELEMETRY_OPERATION.SIGN_OUT,
    );
    expect(scope.setTag).toHaveBeenCalledWith("layer", TELEMETRY_LAYER.SDK);
    expect(scope.setTag).toHaveBeenCalledWith(
      "error_code",
      errorCode.INTERNAL_ERROR,
    );
    expect(scope.setContext).toHaveBeenCalledWith("app_error", {
      error_id: error.errorId,
    });
    expect(scope.setContext).toHaveBeenCalledWith("sdk_meta", {
      provider: "firebase_auth",
      code: "auth/error",
      name: "AuthError",
    });

    // 4) assert: cause が送られる
    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
    expect(mockedCaptureException).toHaveBeenCalledWith(cause);
  });

  it("cause が無い場合は代替 Error を送る", () => {
    // 1) arrange: cause なしの error を作る
    const error = buildErrorFields(errorCode.INTERNAL_ERROR);

    // 2) act: 送信する
    captureErrorToSentry({
      operation: TELEMETRY_OPERATION.SIGN_OUT,
      layer: TELEMETRY_LAYER.MODEL,
      error,
    });
    invokeWithScopeCallback();

    // 3) assert: 代替 Error が送られる
    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
    const arg = mockedCaptureException.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Error);
    if (!(arg instanceof Error)) {
      throw new Error("captureException argument must be Error");
    }
    expect(arg.message).toBe(SENTRY_FALLBACK_ERROR_MESSAGE);
  });
});
