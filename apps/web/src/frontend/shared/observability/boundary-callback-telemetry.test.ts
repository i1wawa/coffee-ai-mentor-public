// apps/web/src/frontend/shared/observability/boundary-callback-telemetry.test.ts
// =============================================================================
// 概要:
// - runBoundaryCallbackWithTelemetry のユニットテスト
//
// 契約:
// - 成功時は Sentry 送信しない
// - throw 時は ErrorFields に正規化して Sentry 送信を呼ぶ
// - ErrorFields throw 時は errorId/errorCode を保持して送る
// =============================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runBoundaryCallbackWithTelemetry } from "./boundary-callback-telemetry";
import { captureErrorToSentry } from "./sentry.client";
import { TELEMETRY_LAYER, TELEMETRY_OPERATION } from "./telemetry-tags";

vi.mock("./sentry.client", () => {
  return {
    captureErrorToSentry: vi.fn(),
  };
});

describe("runBoundaryCallbackWithTelemetry", () => {
  const mockedCaptureErrorToSentry = vi.mocked(captureErrorToSentry);

  beforeEach(() => {
    // 1) テスト間の干渉を防ぐ
    mockedCaptureErrorToSentry.mockReset();
  });

  it("成功時は Sentry 送信しない", async () => {
    // 1) arrange: 成功する関数を用意する
    const fn = vi.fn(async () => {});

    // 2) act: 実行する
    await runBoundaryCallbackWithTelemetry({
      operation: TELEMETRY_OPERATION.SIGN_OUT,
      layer: TELEMETRY_LAYER.UI,
      fn,
    });

    // 3) assert: callback は実行され、Sentry は送られない
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(0);
  });

  it("throw 時は INTERNAL_ERROR に正規化し、cause を保持して送る", async () => {
    // 1) arrange: Error を throw する関数を用意する
    const boom = new Error("boom");
    const fn = async () => {
      throw boom;
    };

    // 2) act: 実行する
    const operation = TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP;
    await runBoundaryCallbackWithTelemetry({
      operation,
      layer: TELEMETRY_LAYER.SHARED,
      fn,
    });

    // 3) assert: Sentry 送信が正規化エラーで呼ばれる
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(1);
    const [args] = mockedCaptureErrorToSentry.mock.calls[0];
    expect(args.operation).toBe(operation);
    expect(args.layer).toBe(TELEMETRY_LAYER.SHARED);
    expect(args.error.errorCode).toBe(errorCode.INTERNAL_ERROR);
    expect(args.error.errorId).toEqual(expect.stringMatching(/.+/));
    expect(args.error.cause).toBe(boom);
  });

  it("ErrorFields を throw した場合は errorId/errorCode を保持して送る", async () => {
    // 1) arrange: ErrorFields を throw する関数を用意する
    const original = buildErrorFields(errorCode.CANCELLED);
    const fn = async () => {
      throw original;
    };

    // 2) act: 実行する
    await runBoundaryCallbackWithTelemetry({
      operation: TELEMETRY_OPERATION.REVOKE_SESSION,
      layer: TELEMETRY_LAYER.SHARED,
      fn,
    });

    // 3) assert: errorId/errorCode は維持され、cause が追加される
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(1);
    const [args] = mockedCaptureErrorToSentry.mock.calls[0];
    expect(args.error.errorCode).toBe(original.errorCode);
    expect(args.error.errorId).toBe(original.errorId);
    expect(args.error.cause).toBe(original);
  });
});
