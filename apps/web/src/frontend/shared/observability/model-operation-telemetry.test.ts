// apps/web/src/frontend/shared/observability/model-operation-telemetry.test.ts
// =================================================================
// 概要:
// - runModelOperationWithTelemetry のユニットテスト
//
// 契約:
// - ok はそのまま返し、Sentry 送信は行わない
// - err は UiErrorFields に変換し、Sentry 送信を呼ぶ
// - throw は INTERNAL_ERROR として畳み込み、cause を保持して送る
// =================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectOkValue,
  expectUiErrCode,
} from "@/tests/vitest-utils/utils/result-assertions";
import { UI_ERROR_ACTION } from "../errors/error-ui-action.mapper";
import { runModelOperationWithTelemetry } from "./model-operation-telemetry";
import { captureErrorToSentry } from "./sentry.client";
import { TELEMETRY_OPERATION } from "./telemetry-tags";

vi.mock("./sentry.client", () => {
  return {
    captureErrorToSentry: vi.fn(),
  };
});

describe("runModelOperationWithTelemetry", () => {
  const mockedCaptureErrorToSentry = vi.mocked(captureErrorToSentry);

  beforeEach(() => {
    // 1) テスト間の干渉を防ぐ
    mockedCaptureErrorToSentry.mockReset();
  });

  it("失敗: Sentry 送信を呼び、返り値は UiErrorFields に変換される", async () => {
    // 1) arrange: INTERNAL_ERROR を用意する
    const error = buildErrorFields(errorCode.INTERNAL_ERROR);
    const fn = async () => err(error);

    // 2) act: 実行する
    const result = await runModelOperationWithTelemetry({
      operation: TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
      fn,
    });

    // 3) assert: err が返り、uiErrorAction が付く
    expectUiErrCode(result, errorCode.INTERNAL_ERROR, UI_ERROR_ACTION.SUPPORT);

    // 4) assert: Sentry 送信が呼ばれる
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(1);
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
        layer: "model",
        error,
      }),
    );
  });

  it("成功: ok はそのまま返し、Sentry 送信は行わない", async () => {
    // 1) arrange: ok を返す関数を用意する
    const fn = async () => ok("value");

    // 2) act: 実行する
    const result = await runModelOperationWithTelemetry({
      operation: TELEMETRY_OPERATION.SIGN_OUT,
      fn,
    });

    // 3) assert: ok が返る
    expectOkValue(result, "value");

    // 4) assert: Sentry 送信は呼ばれない
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(0);
  });

  it("例外: INTERNAL_ERROR に畳み込み、cause を保持して送る", async () => {
    // 1) arrange: 例外を投げる関数を用意する
    const boom = new Error("boom");
    const fn = async () => {
      throw boom;
    };

    // 2) act: 実行する
    const result = await runModelOperationWithTelemetry({
      operation: TELEMETRY_OPERATION.SIGN_OUT,
      fn,
    });

    // 3) assert: err が返り、uiErrorAction が付く
    expectUiErrCode(result, errorCode.INTERNAL_ERROR, UI_ERROR_ACTION.SUPPORT);

    // 4) assert: Sentry 送信が cause を保持して呼ばれる
    const [args] = mockedCaptureErrorToSentry.mock.calls[0];
    expect(args.operation).toBe(TELEMETRY_OPERATION.SIGN_OUT);
    expect(args.layer).toBe("model");
    expect(args.error.errorCode).toBe(errorCode.INTERNAL_ERROR);
    expect(args.error.errorId).toEqual(expect.stringMatching(/.+/));
    expect(args.error.cause).toBe(boom);
  });
});
