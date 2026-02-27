// apps/web/src/frontend/features/auth/api/sign-out.test.ts
// ================================================================
// 概要:
// - signOut（frontend/api）のユニットテスト
//
// 契約:
// - DELETE /api/auth/session を 1 回呼ぶ
// - 成功時 data は { cleared: boolean } を満たす（満たさない場合は INTERNAL_ERROR）
// - 失敗時は http-client の ErrorFields を加工せずに返す
// ================================================================

import { AUTH_PATHS } from "@contracts/src/auth/auth-contract";
import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteJson } from "@/frontend/shared/api/http-client";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import { signOut } from "./sign-out";

vi.mock("@/frontend/shared/api/http-client", () => {
  return {
    deleteJson: vi.fn(),
  };
});

describe("features/auth/api signOut", () => {
  const mockedDeleteJson = vi.mocked(deleteJson);

  beforeEach(() => {
    // 1) テスト間の干渉を防ぐ
    mockedDeleteJson.mockReset();
  });

  it("失敗: http-client が ErrorFields を返した場合は、そのまま返す", async () => {
    // 1) 代表エラーを作る
    const error: ErrorFields = buildErrorFields(errorCode.UNAVAILABLE);

    // 2) deleteJson が失敗したことにする
    mockedDeleteJson.mockResolvedValue(err(error));

    // 3) 実行
    const result = await signOut();

    // 4) 失敗のまま返る
    expectErrCode(result, error.errorCode);
    expect(result.error).toBe(error);
  });

  it("失敗: 成功ステータスでも data shape が壊れていれば INTERNAL_ERROR", async () => {
    // 1) data が契約外の形を返す
    // - cleared が無い、または boolean でない、など
    mockedDeleteJson.mockResolvedValue(ok({} as unknown));

    // 2) 実行
    const result = await signOut();

    // 3) 契約外ボディなので失敗に倒す
    expectErrCode(result, errorCode.INTERNAL_ERROR);
  });

  it("成功: DELETE が成功し、data が { cleared:boolean } なら ok を返す", async () => {
    // 1) サーバ成功ボディを模擬する
    mockedDeleteJson.mockResolvedValue(ok({ cleared: true }));

    // 2) 実行
    const result = await signOut();

    // 3) 成功
    expectOkValue(result, undefined);

    // 4) deleteJson が /api/auth/session を呼んでいる
    expect(mockedDeleteJson).toHaveBeenCalledTimes(1);
    expect(mockedDeleteJson).toHaveBeenCalledWith({ url: AUTH_PATHS.session });
  });
});
