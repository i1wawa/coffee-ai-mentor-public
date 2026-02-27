// apps/web/src/frontend/entities/user/api/get-session-user.test.ts
// ================================================================
// 概要:
// - getSessionUser（frontend/api）のユニットテスト
//
// 契約:
// - GET /api/auth/session を呼ぶ（AUTH_PATHS.session）
// - 成功時 data は session 状態の契約を満たす（満たさない場合は INTERNAL_ERROR）
// - 未サインインは ok(null)
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
import { getJson } from "@/frontend/shared/api/http-client";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import { getSessionUser } from "./get-session-user";

vi.mock("@/frontend/shared/api/http-client", () => {
  return {
    getJson: vi.fn(),
  };
});

describe("entities/user/api getSessionUser", () => {
  const mockedGetJson = vi.mocked(getJson);

  beforeEach(() => {
    // 1) テスト間の干渉を防ぐ
    mockedGetJson.mockReset();
  });

  it("失敗: http-client が ErrorFields を返した場合は、そのまま返す", async () => {
    // 1) 代表エラーを作る
    const error: ErrorFields = buildErrorFields(errorCode.AUTH_REQUIRED);

    // 2) getJson が失敗したことにする
    mockedGetJson.mockResolvedValue(err(error));

    // 3) 実行
    const result = await getSessionUser();

    // 4) 失敗のまま返る
    expectErrCode(result, error.errorCode);
    expect(result.error).toBe(error);

    // 5) getJson が /api/auth/session を呼んでいる
    expect(mockedGetJson).toHaveBeenCalledTimes(1);
    expect(mockedGetJson).toHaveBeenCalledWith({ url: AUTH_PATHS.session });
  });

  it("失敗: 成功でも data shape が壊れていれば INTERNAL_ERROR", async () => {
    // 1) data が契約外の形を返す
    // - authenticated が無い、または user の形が壊れている、など
    mockedGetJson.mockResolvedValue(ok({} as unknown));

    // 2) 実行
    const result = await getSessionUser();

    // 3) 契約外ボディなので失敗に倒す
    expectErrCode(result, errorCode.INTERNAL_ERROR);

    // 4) getJson が /api/auth/session を呼んでいる
    expect(mockedGetJson).toHaveBeenCalledTimes(1);
    expect(mockedGetJson).toHaveBeenCalledWith({ url: AUTH_PATHS.session });
  });

  it("成功: authenticated=false なら null を返す", async () => {
    // 1) 未サインインを模擬する
    mockedGetJson.mockResolvedValue(
      ok({
        authenticated: false,
        user: null,
      }),
    );

    // 2) 実行
    const result = await getSessionUser();

    // 3) 成功（未サインインは null）
    expectOkValue(result, null);

    // 4) getJson が /api/auth/session を呼んでいる
    expect(mockedGetJson).toHaveBeenCalledTimes(1);
    expect(mockedGetJson).toHaveBeenCalledWith({ url: AUTH_PATHS.session });
  });

  it("成功: authenticated=true なら uid を返す", async () => {
    // 1) サーバ成功ボディを模擬する
    mockedGetJson.mockResolvedValue(
      ok({
        authenticated: true,
        user: { uid: "u1" },
      }),
    );

    // 2) 実行
    const result = await getSessionUser();

    // 3) 成功
    expectOkValue(result, { uid: "u1" });

    // 4) getJson が /api/auth/session を呼んでいる
    expect(mockedGetJson).toHaveBeenCalledTimes(1);
    expect(mockedGetJson).toHaveBeenCalledWith({ url: AUTH_PATHS.session });
  });
});
