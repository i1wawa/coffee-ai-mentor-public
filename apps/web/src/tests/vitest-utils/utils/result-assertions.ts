// apps/web/src/tests/vitest-utils/utils/result-assertions.ts
// ================================================================
// 概要:
// - Result（ok/error）用の Vitest assertion ヘルパ
//
// 目的:
// - `expect(result.ok).toBe(true/false)` を共通化しつつ、TS の型絞りを効かせる
// - テスト側の if 分岐や不要な throw を減らす
// ================================================================

import type {
  ErrorCode,
  ErrorFields,
} from "@packages/observability/src/logging/telemetry-error-common";
import type { Result } from "@packages/shared/src/result";
import { expect } from "vitest";
import type {
  UiErrorAction,
  UiErrorFields,
} from "@/frontend/shared/errors/error-ui-action.mapper";

/**
 * Result が ok であることをアサートする
 */
export function expectOk<T, E>(
  result: Result<T, E>,
): asserts result is { ok: true; value: T } {
  expect(result.ok).toBe(true);
}

/**
 * Result が error であることをアサートする
 */
export function expectErr<T, E>(
  result: Result<T, E>,
): asserts result is { ok: false; error: E } {
  expect(result.ok).toBe(false);
}

/**
 * Result が ok かつ value が期待値と一致することをアサートする
 */
export function expectOkValue<T, E>(
  result: Result<T, E>,
  expectedValue: unknown,
): asserts result is { ok: true; value: T } {
  expectOk(result);
  expect(result.value).toEqual(expectedValue);
}

/**
 * Result が error かつ errorCode が期待値と一致することをアサートする
 */
export function expectErrCode<T, E extends ErrorFields>(
  result: Result<T, E>,
  expectedErrorCode: ErrorCode,
  expectedExtra?: Partial<E>,
): asserts result is { ok: false; error: E } {
  expectErr(result);
  expect(result.error.errorId).toEqual(expect.stringMatching(/.+/));
  expect(result.error.errorCode).toBe(expectedErrorCode);
  if (expectedExtra) {
    expect(result.error).toMatchObject(expectedExtra);
  }
}

/**
 * UiResult が error かつ errorCode / uiErrorAction が期待値と一致することをアサートする
 */
export function expectUiErrCode<T, E extends UiErrorFields>(
  result: Result<T, E>,
  expectedErrorCode: ErrorCode,
  expectedAction: UiErrorAction,
): asserts result is { ok: false; error: E } {
  expectErrCode(result, expectedErrorCode);
  expect(result.error.uiErrorAction).toBe(expectedAction);
}
