// apps/web/src/frontend/features/users/api/get-user-me.test.ts
// ================================================================
// 概要:
// - getUserMe（frontend/api）のユニットテスト
//
// 契約:
// - GET /api/users/me を呼ぶ（USER_PATHS.me）
// - 成功時 data は { uid } の契約を満たし、uid の前後空白は trim して返す（満たさない場合は INTERNAL_ERROR）
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
import { getJson } from "@/frontend/shared/api/http-client";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import { getUserMe } from "./get-user-me";

vi.mock("@/frontend/shared/api/http-client", () => {
  return {
    getJson: vi.fn(),
  };
});

describe("features/users/api getUserMe", () => {
  const mockedGetJson = vi.mocked(getJson);

  beforeEach(() => {
    // 1) テスト間の干渉を防ぐ
    mockedGetJson.mockReset();
  });

  it("失敗: API が ErrorFields を返した場合は、そのまま返す", async () => {
    // 1) 代表エラーを作る
    const error: ErrorFields = buildErrorFields(errorCode.AUTH_REQUIRED);

    // 2) getJson が失敗したことにする
    mockedGetJson.mockResolvedValue(err(error));

    // 3) 実行
    const result = await getUserMe();

    // 4) 失敗のまま返る
    expectErrCode(result, error.errorCode);
    expect(result.error).toBe(error);

    // 5) getJson が /api/users/me を呼んでいる
    expect(mockedGetJson).toHaveBeenCalledTimes(1);
    expect(mockedGetJson).toHaveBeenCalledWith({ url: USER_PATHS.me });
  });

  it("失敗: 成功でも data shape が壊れていれば INTERNAL_ERROR", async () => {
    // 1) data が契約外の形を返す
    mockedGetJson.mockResolvedValue(ok({} as unknown));

    // 2) 実行
    const result = await getUserMe();

    // 3) 契約外ボディなので失敗に倒す
    expectErrCode(result, errorCode.INTERNAL_ERROR);

    // 4) getJson が /api/users/me を呼んでいる
    expect(mockedGetJson).toHaveBeenCalledTimes(1);
    expect(mockedGetJson).toHaveBeenCalledWith({ url: USER_PATHS.me });
  });

  it("失敗: uid が空なら INTERNAL_ERROR", async () => {
    // 1) uid が空の形を返す
    mockedGetJson.mockResolvedValue(ok({ uid: "   " }));

    // 2) 実行
    const result = await getUserMe();

    // 3) 契約外ボディなので失敗に倒す
    expectErrCode(result, errorCode.INTERNAL_ERROR);

    // 4) getJson が /api/users/me を呼んでいる
    expect(mockedGetJson).toHaveBeenCalledTimes(1);
    expect(mockedGetJson).toHaveBeenCalledWith({ url: USER_PATHS.me });
  });

  it("成功: uid の前後空白は trim されて返る", async () => {
    // 1) uid の前後に空白を含む成功ボディを模擬する
    mockedGetJson.mockResolvedValue(ok({ uid: "  u1  " }));

    // 2) 実行
    const result = await getUserMe();

    // 3) 成功（trim 後の値を返す）
    expectOkValue(result, { uid: "u1" });

    // 4) getJson が /api/users/me を呼んでいる
    expect(mockedGetJson).toHaveBeenCalledTimes(1);
    expect(mockedGetJson).toHaveBeenCalledWith({ url: USER_PATHS.me });
  });

  it("成功: uid を返す", async () => {
    // 1) サーバ成功ボディを模擬する
    mockedGetJson.mockResolvedValue(ok({ uid: "u1" }));

    // 2) 実行
    const result = await getUserMe();

    // 3) 成功
    expectOkValue(result, { uid: "u1" });

    // 4) getJson が /api/users/me を呼んでいる
    expect(mockedGetJson).toHaveBeenCalledTimes(1);
    expect(mockedGetJson).toHaveBeenCalledWith({ url: USER_PATHS.me });
  });
});
