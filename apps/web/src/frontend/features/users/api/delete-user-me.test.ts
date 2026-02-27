// apps/web/src/frontend/features/users/api/delete-user-me.test.ts
// ================================================================
// 概要:
// - deleteUserMe（frontend/api）のユニットテスト
//
// 契約:
// - DELETE /api/users/me を 1 回呼ぶ（body を送らない）
// - 成功時 data は { deleted:true } を満たす（満たさない場合は INTERNAL_ERROR）
// - 失敗時は http-client の ErrorFields を加工せずに返す
// ================================================================

import { USER_PATHS } from "@contracts/src/users/users-contract";
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
import { deleteUserMe } from "./delete-user-me";

vi.mock("@/frontend/shared/api/http-client", () => {
  return {
    deleteJson: vi.fn(),
  };
});

describe("features/users/api deleteUserMe", () => {
  const mockedDeleteJson = vi.mocked(deleteJson);

  beforeEach(() => {
    mockedDeleteJson.mockReset();
  });

  it("失敗: API が ErrorFields を返した場合は、そのまま返す", async () => {
    // 1) サーバ失敗ボディを模擬する
    const error: ErrorFields = buildErrorFields(errorCode.UNAVAILABLE);

    // 2) deleteJson が失敗したことにする
    mockedDeleteJson.mockResolvedValue(err(error));

    // 3) 実行
    const result = await deleteUserMe();

    // 4) 失敗のまま返る
    expectErrCode(result, error.errorCode);
    expect(result.error).toBe(error);
  });

  it("失敗: 成功ステータスでも data shape が壊れていれば INTERNAL_ERROR", async () => {
    // 1) data が契約外の形を返す
    mockedDeleteJson.mockResolvedValue(ok({} as unknown));

    // 2) 実行
    const result = await deleteUserMe();

    // 3) 契約外ボディなので失敗に倒す
    expectErrCode(result, errorCode.INTERNAL_ERROR);
  });

  it("成功: DELETE が成功し、data が { deleted:true } なら ok を返す", async () => {
    // 1) サーバ成功ボディを模擬する
    mockedDeleteJson.mockResolvedValue(ok({ deleted: true }));

    // 2) 実行
    const result = await deleteUserMe();

    // 3) 成功
    expectOkValue(result, undefined);
    expect(mockedDeleteJson).toHaveBeenCalledTimes(1);
    expect(mockedDeleteJson).toHaveBeenCalledWith({
      url: USER_PATHS.me,
    });
  });
});
