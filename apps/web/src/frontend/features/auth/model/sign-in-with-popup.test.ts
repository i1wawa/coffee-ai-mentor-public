// apps/web/src/frontend/features/auth/model/sign-in-with-popup.test.ts
// ================================================================
// 概要:
// - sign-in-with-popup（model）のユニットテスト
//
// 契約:
// - providerId から provider を生成する
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
import { toUiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import { signInWithPopupAndGetIdToken } from "@/frontend/shared/firebase/firebase-auth";
import {
  expectOkValue,
  expectUiErrCode,
} from "@/tests/vitest-utils/utils/result-assertions";
import {
  createOAuthProvider,
  type OAuthProviderId,
} from "../config/oauth-providers.config";
import { signInWithPopupAndIssueSessionCookie } from "./sign-in-with-popup";

vi.mock("../config/oauth-providers.config", () => {
  return {
    createOAuthProvider: vi.fn(),
  };
});

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

describe("signInWithPopupAndIssueSessionCookie", () => {
  // 型付きのモック参照にして、引数/戻り値を型で守る
  const mockedCreateProvider = vi.mocked(createOAuthProvider);
  const mockedPopup = vi.mocked(signInWithPopupAndGetIdToken);
  const mockedExchange = vi.mocked(exchangeIdTokenForSessionCookie);

  beforeEach(() => {
    // 1) テスト間の干渉を防ぐ
    mockedCreateProvider.mockReset();
    mockedPopup.mockReset();
    mockedExchange.mockReset();
  });

  it("失敗: Popup失敗は exchange せずにそのまま返す", async () => {
    // 1) 入力: providerId から provider を生成する
    const providerId: OAuthProviderId = "google";
    const providerStub = { providerId: "google.com" } as AuthProvider;
    mockedCreateProvider.mockReturnValue(providerStub);

    // 2) Popup失敗（代表エラー）
    const popupError: ErrorFields = buildErrorFields(errorCode.INTERNAL_ERROR);
    mockedPopup.mockResolvedValue(err(popupError));

    // 3) 実行
    const result = await signInWithPopupAndIssueSessionCookie({
      providerId,
    });

    // 4) 検証: 失敗のまま返る
    expectUiErrCode(
      result,
      popupError.errorCode,
      toUiErrorFields(popupError).uiErrorAction,
    );

    // 5) 検証: exchange を呼ばない
    expect(mockedExchange).toHaveBeenCalledTimes(0);
  });

  it("失敗: exchange失敗はそのまま返す", async () => {
    // 1) 入力: providerId から provider を生成する
    const providerId: OAuthProviderId = "google";
    const providerStub = { providerId: "google.com" } as AuthProvider;
    mockedCreateProvider.mockReturnValue(providerStub);

    // 2) Popup成功
    mockedPopup.mockResolvedValue(ok({ idToken: "token-123" }));

    // 3) exchange失敗（代表エラー）
    const exchangeError: ErrorFields = buildErrorFields(errorCode.UNAVAILABLE);
    mockedExchange.mockResolvedValue(err(exchangeError));

    // 4) 実行
    const result = await signInWithPopupAndIssueSessionCookie({
      providerId,
    });

    // 5) 検証: 失敗のまま返る
    expectUiErrCode(
      result,
      exchangeError.errorCode,
      toUiErrorFields(exchangeError).uiErrorAction,
    );
  });

  it("成功: provider生成→Popup→exchange が呼ばれて ok を返す", async () => {
    // 1) 入力: providerId は config で provider 生成される契約
    const providerId: OAuthProviderId = "google";

    // 2) provider の形だけ用意（中身の挙動には依存しない）
    const providerStub = { providerId: "google.com" } as AuthProvider;

    // 3) provider生成の戻り値を固定し、popup へ渡る契約を見る
    mockedCreateProvider.mockReturnValue(providerStub);

    // 4) Popup 成功 → idToken を返す
    mockedPopup.mockResolvedValue(ok({ idToken: "token-123" }));

    // 5) exchange 成功（戻り値は void）
    mockedExchange.mockResolvedValue(ok(undefined));

    // 6) 実行
    const result = await signInWithPopupAndIssueSessionCookie({
      providerId,
    });

    // 7) 検証: 成功
    expectOkValue(result, undefined);

    // 8) 検証: provider生成 → popup → exchange の配線が切れていない
    expect(mockedCreateProvider).toHaveBeenCalledTimes(1);
    expect(mockedCreateProvider).toHaveBeenCalledWith(providerId);
    expect(mockedPopup).toHaveBeenCalledTimes(1);
    expect(mockedPopup).toHaveBeenCalledWith({ provider: providerStub });
    expect(mockedExchange).toHaveBeenCalledTimes(1);
    expect(mockedExchange).toHaveBeenCalledWith({ idToken: "token-123" });
  });
});
