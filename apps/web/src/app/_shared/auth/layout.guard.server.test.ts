// apps/web/src/app/_shared/auth/layout.guard.server.test.ts
// ================================================================
// 概要:
// - layout 用の認証ゲート関数をユニットテストで固定する
//
// 目的:
// - 認証済みなら /app へ redirect することを保証する
// - 未認証なら public は通す / protected は /sign-in へ redirect することを保証する
// - 想定外エラーは redirect せず err で返すことを保証する
// ================================================================

/* @vitest-environment node */

import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionUserForUi } from "@/app/_shared/auth/get-session-user.server";
import { expectOkValue } from "@/tests/vitest-utils/utils/result-assertions";
import {
  redirectToAppIfAuthenticated,
  requireAuthenticatedOrRedirectToSignIn,
} from "./layout.guard.server";

const redirectSignal = new Error("redirect signal");

vi.mock("next/navigation", () => {
  return {
    redirect: vi.fn(() => {
      throw redirectSignal;
    }),
  };
});

vi.mock("@/app/_shared/auth/get-session-user.server", () => {
  return {
    getSessionUserForUi: vi.fn(),
  };
});

describe("layout guards", () => {
  const mockedGetSessionUserForUi = vi.mocked(getSessionUserForUi);
  const mockedRedirect = vi.mocked(redirect);

  beforeEach(() => {
    mockedGetSessionUserForUi.mockReset();
    mockedRedirect.mockReset();
    mockedRedirect.mockImplementation(() => {
      throw redirectSignal;
    });
  });

  describe("redirectToAppIfAuthenticated", () => {
    it("想定外エラーは redirect せず err を返す", async () => {
      // 1) 想定外エラー
      mockedGetSessionUserForUi.mockResolvedValue(
        err({
          errorId: "err_1",
          errorCode: errorCode.INTERNAL_ERROR,
        }),
      );

      // 2) 実行
      const result = await redirectToAppIfAuthenticated();

      // 3) err を返す
      expect(result).toStrictEqual(
        err({
          errorId: "err_1",
          errorCode: errorCode.INTERNAL_ERROR,
        }),
      );
      expect(mockedRedirect).toHaveBeenCalledTimes(0);
    });

    it("認証済みなら /app に redirect する", async () => {
      // 1) 認証済み
      mockedGetSessionUserForUi.mockResolvedValue(ok({ uid: "uid_1" }));

      // 2) 実行: redirect は制御フロー例外として throw する想定
      await expect(redirectToAppIfAuthenticated()).rejects.toBe(redirectSignal);

      // 3) セッション取得が呼ばれている
      expect(mockedGetSessionUserForUi).toHaveBeenCalledTimes(1);
      expect(mockedRedirect).toHaveBeenCalledTimes(1);
      expect(mockedRedirect).toHaveBeenCalledWith("/app");
    });

    it("未認証なら ok を返して通す", async () => {
      // 1) 未認証
      mockedGetSessionUserForUi.mockResolvedValue(ok(null));

      // 2) 実行
      const result = await redirectToAppIfAuthenticated();

      // 3) redirect はしない
      expectOkValue(result, undefined);
      expect(mockedRedirect).toHaveBeenCalledTimes(0);
    });
  });

  describe("requireAuthenticatedOrRedirectToSignIn", () => {
    it("想定外エラーは redirect せず err を返す", async () => {
      // 1) 想定外エラー
      mockedGetSessionUserForUi.mockResolvedValue(
        err({
          errorId: "err_2",
          errorCode: errorCode.INTERNAL_ERROR,
        }),
      );

      // 2) 実行
      const result = await requireAuthenticatedOrRedirectToSignIn();

      // 3) err を返す
      expect(result).toStrictEqual(
        err({
          errorId: "err_2",
          errorCode: errorCode.INTERNAL_ERROR,
        }),
      );
      expect(mockedRedirect).toHaveBeenCalledTimes(0);
    });

    it("未認証なら /sign-in に redirect する", async () => {
      // 1) 未認証
      mockedGetSessionUserForUi.mockResolvedValue(ok(null));

      // 2) 実行
      await expect(requireAuthenticatedOrRedirectToSignIn()).rejects.toBe(
        redirectSignal,
      );

      // 3) セッション取得が呼ばれている
      expect(mockedGetSessionUserForUi).toHaveBeenCalledTimes(1);
      expect(mockedRedirect).toHaveBeenCalledTimes(1);
      expect(mockedRedirect).toHaveBeenCalledWith("/sign-in");
    });

    it("認証OKなら ok({ uid }) を返す", async () => {
      // 1) 認証OK
      mockedGetSessionUserForUi.mockResolvedValue(ok({ uid: "uid_1" }));

      // 2) 実行
      const result = await requireAuthenticatedOrRedirectToSignIn();

      // 3) uid を返す
      expectOkValue(result, { uid: "uid_1" });
      expect(mockedRedirect).toHaveBeenCalledTimes(0);
    });
  });
});
