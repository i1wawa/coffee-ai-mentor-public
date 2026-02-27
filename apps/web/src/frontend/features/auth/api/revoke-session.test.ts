// apps/web/src/frontend/features/auth/api/revoke-session.test.ts
// ================================================================
// 概要:
// - revokeSession（frontend/api）のユニットテスト
//
// 契約:
// - POST /api/auth/session/revoke を 1 回呼ぶ
// - 成功時 data は { revoked: boolean } を満たす（満たさない場合は INTERNAL_ERROR）
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
import { postJson } from "@/frontend/shared/api/http-client";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import { revokeSession } from "./revoke-session";

vi.mock("@/frontend/shared/api/http-client", () => {
  return {
    postJson: vi.fn(),
  };
});

describe("features/auth/api revokeSession", () => {
  const mockedPostJson = vi.mocked(postJson);

  beforeEach(() => {
    mockedPostJson.mockReset();
  });

  it("失敗: http-client が ErrorFields を返した場合は、そのまま返す", async () => {
    // 1) サーバ失敗ボディを模擬する
    const error: ErrorFields = buildErrorFields(errorCode.UNAVAILABLE);

    // 2) postJson が失敗したことにする
    mockedPostJson.mockResolvedValue(err(error));

    // 3) 実行
    const result = await revokeSession();

    // 4) 失敗のまま返る
    expectErrCode(result, error.errorCode);
    expect(result.error).toBe(error);
  });

  it("失敗: 成功ステータスでも data shape が壊れていれば INTERNAL_ERROR", async () => {
    // 1) data が契約外の形を返す
    mockedPostJson.mockResolvedValue(ok({} as unknown));

    // 2) 実行
    const result = await revokeSession();

    // 3) 契約外ボディなので失敗に倒す
    expectErrCode(result, errorCode.INTERNAL_ERROR);
  });

  it("成功: POST が成功し、data が { revoked:boolean } なら ok を返す", async () => {
    // 1) サーバ成功ボディを模擬する
    mockedPostJson.mockResolvedValue(ok({ revoked: true }));

    // 2) 実行
    const result = await revokeSession();

    // 3) 成功
    expectOkValue(result, undefined);
    expect(mockedPostJson).toHaveBeenCalledTimes(1);
    expect(mockedPostJson).toHaveBeenCalledWith({
      url: AUTH_PATHS.revoke,
    });
  });
});
