// apps/web/src/frontend/features/users/model/delete-user-me-flow.test.ts
// ================================================================
// 概要:
// - delete-user-me-flow（model）のユニットテスト
//
// 契約:
// - deleteUserMeOnce は deleteUserMe の結果を UiResult として返す
// - reauthenticateAndDeleteUserMe は reauth 失敗なら delete を呼ばず失敗を返す
// - reauthenticateAndDeleteUserMe は reauth 成功時に delete を呼び、その結果を返す
// ================================================================

import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import type { AuthProvider } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reauthenticateWithPopupAndIssueSessionCookie } from "@/frontend/features/auth/model/reauthenticate-with-popup-and-issue-session-cookie";
import { toUiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import {
  expectOkValue,
  expectUiErrCode,
} from "@/tests/vitest-utils/utils/result-assertions";
import { deleteUserMe } from "../api/delete-user-me";
import {
  deleteUserMeOnce,
  reauthenticateAndDeleteUserMe,
} from "./delete-user-me-flow";

vi.mock("../api/delete-user-me", () => {
  return {
    deleteUserMe: vi.fn(),
  };
});

vi.mock(
  "@/frontend/features/auth/model/reauthenticate-with-popup-and-issue-session-cookie",
  () => {
    return {
      reauthenticateWithPopupAndIssueSessionCookie: vi.fn(),
    };
  },
);

describe("features/users/model delete-user-me-flow", () => {
  const mockedDeleteUserMe = vi.mocked(deleteUserMe);
  const mockedReauth = vi.mocked(reauthenticateWithPopupAndIssueSessionCookie);

  beforeEach(() => {
    mockedDeleteUserMe.mockReset();
    mockedReauth.mockReset();
  });

  it("失敗: delete 失敗はそのまま返す", async () => {
    // 1) delete 失敗
    const error: ErrorFields = buildErrorFields(errorCode.UNAVAILABLE);
    mockedDeleteUserMe.mockResolvedValue(err(error));

    // 2) 実行
    const result = await deleteUserMeOnce();

    // 3) 失敗のまま返る
    expectUiErrCode(
      result,
      error.errorCode,
      toUiErrorFields(error).uiErrorAction,
    );
    expect(mockedDeleteUserMe).toHaveBeenCalledTimes(1);
  });

  it("成功: delete が成功なら ok を返す", async () => {
    // 1) delete 成功
    mockedDeleteUserMe.mockResolvedValue(ok(undefined));

    // 2) 実行
    const result = await deleteUserMeOnce();

    // 3) 成功
    expectOkValue(result, undefined);
    expect(mockedDeleteUserMe).toHaveBeenCalledTimes(1);
  });

  it("失敗: reauth 失敗なら delete は呼ばず、そのまま返す", async () => {
    // 1) provider は形だけ用意する
    const providerStub = { providerId: "google.com" } as AuthProvider;

    // 2) reauth 失敗
    const error: ErrorFields = buildErrorFields(errorCode.INTERNAL_ERROR);
    mockedReauth.mockResolvedValue(err(error));

    // 3) 実行
    const result = await reauthenticateAndDeleteUserMe({
      provider: providerStub,
    });

    // 4) 失敗のまま返る
    expectUiErrCode(
      result,
      error.errorCode,
      toUiErrorFields(error).uiErrorAction,
    );
    expect(mockedReauth).toHaveBeenCalledTimes(1);
    expect(mockedReauth).toHaveBeenCalledWith({ provider: providerStub });
    expect(mockedDeleteUserMe).toHaveBeenCalledTimes(0);
  });

  it("失敗: reauth 成功後に delete が失敗したら、その失敗を返す", async () => {
    // 1) provider は形だけ用意する
    const providerStub = { providerId: "google.com" } as AuthProvider;

    // 2) reauth 成功
    mockedReauth.mockResolvedValue(ok(undefined));

    // 3) delete 失敗
    const error: ErrorFields = buildErrorFields(errorCode.UNAVAILABLE);
    mockedDeleteUserMe.mockResolvedValue(err(error));

    // 4) 実行
    const result = await reauthenticateAndDeleteUserMe({
      provider: providerStub,
    });

    // 5) 失敗のまま返る
    expectUiErrCode(
      result,
      error.errorCode,
      toUiErrorFields(error).uiErrorAction,
    );
    expect(mockedReauth).toHaveBeenCalledTimes(1);
    expect(mockedReauth).toHaveBeenCalledWith({ provider: providerStub });
    expect(mockedDeleteUserMe).toHaveBeenCalledTimes(1);
  });

  it("成功: reauth 成功後に delete が成功すれば ok を返す", async () => {
    // 1) provider は形だけ用意する
    const providerStub = { providerId: "google.com" } as AuthProvider;

    // 2) reauth 成功
    mockedReauth.mockResolvedValue(ok(undefined));

    // 3) delete 成功
    mockedDeleteUserMe.mockResolvedValue(ok(undefined));

    // 4) 実行
    const result = await reauthenticateAndDeleteUserMe({
      provider: providerStub,
    });

    // 5) 成功
    expectOkValue(result, undefined);
    expect(mockedReauth).toHaveBeenCalledTimes(1);
    expect(mockedReauth).toHaveBeenCalledWith({ provider: providerStub });
    expect(mockedDeleteUserMe).toHaveBeenCalledTimes(1);
  });
});
