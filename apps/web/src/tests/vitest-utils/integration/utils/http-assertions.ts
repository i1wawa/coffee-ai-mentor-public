// apps/web/src/tests/vitest-utils/integration/utils/http-assertions.ts
// ========================================================
// 概要:
// - 統合（HTTP境界）テスト用: HTTP契約アサーション
//
// 責務:
// - 成功レスポンスの共通契約（200 / JSON / ok=true / data）を検査する
// - 失敗レスポンスの共通契約（status / JSON / ok=false / error）を検査する
// - cache-control の no-store 契約を検査する
// ========================================================

import type {
  ApiErrorResponse,
  ApiOkResponse,
} from "@contracts/src/http/api-response-contract";
import {
  type ErrorCode,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { expect } from "vitest";

/**
 * cache-control が no-store を含むことを検査する。
 */
export function expectNoStoreCacheControl(response: Response): void {
  const cacheControl = (
    response.headers.get("cache-control") ?? ""
  ).toLowerCase();
  expect(cacheControl).toContain("no-store");
}

/**
 * API 成功レスポンス（200 + JSON + ok=true + data）を検査する。
 *
 * 返り値:
 * - パース済みの成功レスポンス body
 */
export async function expectApiOkJsonResponse<TExpectedData>(
  response: Response,
  expectedData: TExpectedData,
): Promise<ApiOkResponse<TExpectedData>> {
  // 1) HTTPステータスの契約
  expect(response.status).toBe(200);

  // 2) content-type の契約
  // - charset 付き（application/json; charset=utf-8）を許容する
  const contentType = (
    response.headers.get("content-type") ?? ""
  ).toLowerCase();
  expect(contentType).toContain("application/json");

  // 3) body の契約
  const body = (await response.json()) as ApiOkResponse<TExpectedData>;
  expect(body).toMatchObject({
    ok: true,
    data: expectedData,
  });

  return body;
}

/**
 * API 失敗レスポンス（status + JSON + ok=false + error）を検査する。
 *
 * 返り値:
 * - パース済みの失敗レスポンス body
 */
export async function expectApiErrJsonResponse(
  response: Response,
  expected: {
    status: number;
    errorCode?: ErrorCode;
  },
): Promise<ApiErrorResponse> {
  // 1) HTTPステータスの契約
  expect(response.status).toBe(expected.status);

  // 2) content-type の契約
  // - charset 付き（application/json; charset=utf-8）を許容する
  const contentType = (
    response.headers.get("content-type") ?? ""
  ).toLowerCase();
  expect(contentType).toContain("application/json");

  // 3) body の契約
  const body = (await response.json()) as ApiErrorResponse;
  if (expected.errorCode) {
    expect(body.error.errorCode).toBe(expected.errorCode);
  } else {
    expect(Object.values(errorCode)).toContain(body.error.errorCode);
  }
  expect(body).toMatchObject({
    ok: false,
    error: {
      errorId: expect.stringMatching(/.+/),
      errorCode: expect.stringMatching(/.+/),
    },
  });

  return body;
}
