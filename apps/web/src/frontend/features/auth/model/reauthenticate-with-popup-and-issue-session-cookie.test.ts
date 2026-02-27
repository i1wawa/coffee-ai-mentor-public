// apps/web/src/frontend/features/auth/model/reauthenticate-with-popup-and-issue-session-cookie.test.ts
// ================================================================
// 概要:
// - 再認証モデルのユニットテスト
//
// 契約:
// - Popup失敗は exchange せずにそのまま返す
// - exchange失敗はそのまま返す
// - 成功時は Popup 取得した idToken を exchange に渡して ok を返す
// ================================================================

import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import type { AuthProvider } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeIdTokenForSessionCookie } from "@/frontend/entities/session/api/exchange-id-token-for-session-cookie";
import { signInWithPopupAndGetIdToken } from "@/frontend/shared/firebase/firebase-auth";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import { reauthenticateWithPopupAndIssueSessionCookie } from "./reauthenticate-with-popup-and-issue-session-cookie";

vi.mock("@/frontend/shared/firebase/firebase-auth", () => {
  return {
    signInWithPopupAndGetIdToken: vi.fn(),
  };
});

vi.mock(
  "@/frontend/entities/session/api/exchange-id-token-for-session-cookie",
  () => {
    return {
      exchangeIdTokenForSessionCookie: vi.fn(),
    };
  },
);

describe("reauthenticateWithPopupAndIssueSessionCookie", () => {
  const mockedPopup = vi.mocked(signInWithPopupAndGetIdToken);
  const mockedExchange = vi.mocked(exchangeIdTokenForSessionCookie);

  beforeEach(() => {
    mockedPopup.mockReset();
    mockedExchange.mockReset();
  });

  it("失敗: Popup失敗は exchange せずにそのまま返す", async () => {
    const providerStub = { providerId: "google.com" } as AuthProvider;
    const popupError: ErrorFields = buildErrorFields(errorCode.INTERNAL_ERROR);
    mockedPopup.mockResolvedValue(err(popupError));

    const result = await reauthenticateWithPopupAndIssueSessionCookie({
      provider: providerStub,
    });

    expectErrCode(result, popupError.errorCode);
    expect(result.error).toBe(popupError);
    expect(mockedExchange).toHaveBeenCalledTimes(0);
  });

  it("失敗: exchange失敗はそのまま返す", async () => {
    const providerStub = { providerId: "google.com" } as AuthProvider;
    const exchangeError: ErrorFields = buildErrorFields(errorCode.UNAVAILABLE);
    mockedPopup.mockResolvedValue(ok({ idToken: "token-123" }));
    mockedExchange.mockResolvedValue(err(exchangeError));

    const result = await reauthenticateWithPopupAndIssueSessionCookie({
      provider: providerStub,
    });

    expectErrCode(result, exchangeError.errorCode);
    expect(result.error).toBe(exchangeError);
  });

  it("成功: Popup 取得した idToken を exchange に渡して ok を返す", async () => {
    const providerStub = { providerId: "google.com" } as AuthProvider;
    mockedPopup.mockResolvedValue(ok({ idToken: "token-123" }));
    mockedExchange.mockResolvedValue(ok(undefined));

    const result = await reauthenticateWithPopupAndIssueSessionCookie({
      provider: providerStub,
    });

    expectOkValue(result, undefined);
    expect(mockedPopup).toHaveBeenCalledTimes(1);
    expect(mockedPopup).toHaveBeenCalledWith({ provider: providerStub });
    expect(mockedExchange).toHaveBeenCalledTimes(1);
    expect(mockedExchange).toHaveBeenCalledWith({ idToken: "token-123" });
  });
});
