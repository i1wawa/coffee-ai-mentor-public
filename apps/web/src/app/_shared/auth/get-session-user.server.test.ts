// apps/web/src/app/_shared/auth/get-session-user.server.test.ts
// ================================================================
// 概要:
// - getSessionUserForUi の分岐をユニットテストで固定する
//
// 目的:
// - cookie 未設定を未認証として扱うことを保証する
// - 過長 cookie を未認証として扱うことを保証する
// - usecase 側の AUTH_REQUIRED / AUTH_INVALID を未認証として丸めることを保証する
// - 想定外エラーを err として返すことを保証する
// - 認証成功時に uid を返すことを保証する
// ================================================================

/* @vitest-environment node */

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIdentityDeps } from "@/backend/composition/identity.composition.server";
import { getSessionUser } from "@/backend/identity/applications/get-session-user.usecase.server";
import type { SessionAuthError } from "@/backend/identity/applications/session-auth.port";
import { SESSION_COOKIE_NAME } from "@/backend/shared/http/cookies";
import { MAX_SESSION_COOKIE_CHARS } from "@/backend/shared/http/request.guard.server";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import { getSessionUserForUi } from "./get-session-user.server";

const depsState = vi.hoisted(() => {
  return {
    getSessionUserDeps: { name: "deps_for_get_session_user" } as const,
  };
});

type ReadonlyRequestCookies = Awaited<ReturnType<typeof cookies>>;

function buildCookieStore(args: {
  value: string | undefined;
}): ReadonlyRequestCookies {
  return {
    get: (name: string) => {
      if (name !== SESSION_COOKIE_NAME) return undefined;
      if (args.value === undefined) return undefined;
      return { value: args.value };
    },
  } as unknown as ReadonlyRequestCookies;
}

vi.mock("next/headers", () => {
  return {
    cookies: vi.fn(),
  };
});

vi.mock("@/backend/composition/identity.composition.server", () => {
  return {
    createIdentityDeps: vi.fn(() => {
      return { getSessionUserDeps: depsState.getSessionUserDeps };
    }),
  };
});

vi.mock(
  "@/backend/identity/applications/get-session-user.usecase.server",
  () => {
    return {
      getSessionUser: vi.fn(),
    };
  },
);

describe("getSessionUserForUi", () => {
  const mockedCookies = vi.mocked(cookies);
  const mockedCreateIdentityDeps = vi.mocked(createIdentityDeps);
  const mockedGetSessionUser = vi.mocked(getSessionUser);
  let sessionCookieValue: string | undefined;

  beforeEach(() => {
    mockedCookies.mockReset();
    mockedGetSessionUser.mockReset();
    mockedCreateIdentityDeps.mockClear();
    sessionCookieValue = undefined;
    mockedCookies.mockImplementation(async () => {
      return buildCookieStore({ value: sessionCookieValue });
    });
  });

  it("cookie が過長のとき、未認証扱いとして ok(null) を返す", async () => {
    // 1) 過長 cookie を用意する
    sessionCookieValue = "a".repeat(MAX_SESSION_COOKIE_CHARS + 1);

    // 2) 実行
    const result = await getSessionUserForUi();

    // 3) 未認証はエラーではない
    expectOkValue(result, null);

    // 4) backend 依存は初期化しない（DoS/無駄な例外を抑える契約）
    expect(mockedCreateIdentityDeps).toHaveBeenCalledTimes(0);
    expect(mockedGetSessionUser).toHaveBeenCalledTimes(0);
  });

  it("失敗: AUTH_REQUIRED は未認証扱いとして ok(null) を返す", async () => {
    // 1) cookie を用意する
    sessionCookieValue = "session_cookie";

    // 2) usecase の失敗を用意する
    mockedGetSessionUser.mockResolvedValue(
      err({
        ...buildErrorFields(errorCode.AUTH_REQUIRED),
        shouldClearSessionCookie: false,
      } satisfies SessionAuthError),
    );

    // 3) 実行
    const result = await getSessionUserForUi();

    // 4) 未認証はエラーではない
    expectOkValue(result, null);
  });

  it("失敗: AUTH_INVALID は未認証扱いとして ok(null) を返す", async () => {
    // 1) cookie を用意する
    sessionCookieValue = "session_cookie";

    // 2) usecase の失敗を用意する
    mockedGetSessionUser.mockResolvedValue(
      err({
        ...buildErrorFields(errorCode.AUTH_INVALID),
        shouldClearSessionCookie: true,
      } satisfies SessionAuthError),
    );

    // 3) 実行
    const result = await getSessionUserForUi();

    // 4) 未認証はエラーではない
    expectOkValue(result, null);
  });

  it("失敗: 想定外の errorCode は err({ errorId, errorCode }) を返す", async () => {
    // 1) cookie を用意する
    sessionCookieValue = "session_cookie";

    // 2) usecase の失敗を用意する
    const expectedErrorCode = errorCode.INTERNAL_ERROR;
    mockedGetSessionUser.mockResolvedValue(
      err({
        ...buildErrorFields(expectedErrorCode),
        shouldClearSessionCookie: false,
      } satisfies SessionAuthError),
    );

    // 3) 実行
    const result = await getSessionUserForUi();

    // 4) 想定外は err として返す
    expectErrCode(result, expectedErrorCode);
  });

  it("成功: usecase が ok({ uid }) を返すと ok({ uid }) を返す", async () => {
    // 1) cookie を用意する（前後空白を含める）
    sessionCookieValue = "  session_cookie  ";

    // 2) usecase の成功を用意する
    mockedGetSessionUser.mockResolvedValue(ok({ uid: "uid_1" }));

    // 3) 実行
    const result = await getSessionUserForUi();

    // 4) uid を返す
    expectOkValue(result, { uid: "uid_1" });

    // 5) backend 依存合成と usecase 呼び出しが行われる
    expect(mockedCreateIdentityDeps).toHaveBeenCalledTimes(1);
    expect(mockedGetSessionUser).toHaveBeenCalledTimes(1);

    // 6) usecase へは正規化済みの cookie 値が渡る
    expect(mockedGetSessionUser).toHaveBeenCalledWith(
      depsState.getSessionUserDeps,
      {
        sessionCookieValue: "session_cookie",
      },
    );
  });
});
