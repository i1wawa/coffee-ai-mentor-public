// apps/web/src/backend/identity/applications/revoke-auth-session.usecase.server.test.ts
// ================================================================
// 概要:
// - revokeAuthSession のユニットテスト
//
// 契約:
// - sessionCookieValue は trim 後に必須。空なら AUTH_REQUIRED を返し、port は呼ばない
// - port へ渡す sessionCookieValue は trim 済み
// - verifySessionUser が失敗したら、その Result を加工せず透過する
// - verifySessionUser が成功したら、その uid を使って revokeRefreshTokens を呼ぶ
// - revokeRefreshTokens が失敗したら、その Result を加工せず透過する
// - 両方成功したら ok({ uid }) を返す
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SessionAuthPort,
  SessionUser,
} from "@/backend/identity/applications/session-auth.port";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import type { RevokeAuthSessionDeps } from "./revoke-auth-session.usecase.server";
import { revokeAuthSession } from "./revoke-auth-session.usecase.server";

describe("revokeSession", () => {
  const verifySessionUser = vi.fn<SessionAuthPort["verifySessionUser"]>();
  const revokeRefreshTokens = vi.fn<SessionAuthPort["revokeRefreshTokens"]>();
  const deps = {
    sessionAuth: {
      verifySessionUser,
      revokeRefreshTokens,
    },
  } satisfies RevokeAuthSessionDeps;

  beforeEach(() => {
    // 1) 各テストの呼び出し回数をリセットする
    verifySessionUser.mockReset();
    revokeRefreshTokens.mockReset();
  });

  it("cookie は trim して verifySessionUser に渡す", async () => {
    const sessionCookieValue = "cookie_value";

    // 1) 最低限の成功戻り値を用意する
    verifySessionUser.mockResolvedValueOnce({
      ok: true,
      value: { uid: "uid_for_trim_check" } satisfies SessionUser,
    });
    revokeRefreshTokens.mockResolvedValueOnce({
      ok: true,
      value: null,
    });

    // 2) 前後空白つきで入力する
    await revokeAuthSession(deps, {
      sessionCookieValue: ` ${sessionCookieValue} `,
    });

    // 3) verify は trim 済み値で呼ばれる
    expect(verifySessionUser).toHaveBeenCalledTimes(1);
    expect(verifySessionUser).toHaveBeenCalledWith({
      sessionCookieValue,
    });
  });

  it("cookie が空なら AUTH_REQUIRED を返し、port は呼ばない", async () => {
    // 1) 空白だけの cookie を渡す
    const result = await revokeAuthSession(deps, {
      sessionCookieValue: "   ",
    });

    // 2) 入力不正なので port は呼ばれない
    expect(verifySessionUser).toHaveBeenCalledTimes(0);
    expect(revokeRefreshTokens).toHaveBeenCalledTimes(0);

    // 3) Result は失敗
    expectErrCode(result, errorCode.AUTH_REQUIRED, {
      shouldClearSessionCookie: false,
    });
  });

  it("verifySessionUser が失敗したら、その Result を加工せず透過し、revokeRefreshTokens は呼ばない", async () => {
    // 1) verify 側の失敗 Result を用意する
    const verifyResult: Awaited<
      ReturnType<SessionAuthPort["verifySessionUser"]>
    > = {
      ok: false as const,
      error: {
        // エラー形状を SessionAuthError に寄せるため buildErrorFields を使う
        // - errorId はランダムだが、透過テストなので一致比較しない
        ...buildErrorFields(errorCode.AUTH_INVALID),
        shouldClearSessionCookie: true,
      },
    };

    // 2) verify は失敗を返す
    verifySessionUser.mockResolvedValueOnce(verifyResult);

    // 3) 正常な cookie を渡して verify を実行させる
    const result = await revokeAuthSession(deps, {
      sessionCookieValue: "cookie_value",
    });

    // 4) verify は 1 回呼ばれる
    expect(verifySessionUser).toHaveBeenCalledTimes(1);

    // 5) verify が失敗したので revoke は呼ばれない
    expect(revokeRefreshTokens).toHaveBeenCalledTimes(0);

    // 6) 返り値は同じ内容で透過される
    expect(result).toEqual(verifyResult);
  });

  it("revokeRefreshTokens が失敗したら、その Result を加工せず透過する", async () => {
    // 1) verify の成功結果を用意する
    const sessionUser = { uid: "uid_1" } satisfies SessionUser;

    verifySessionUser.mockResolvedValueOnce({
      ok: true,
      value: sessionUser,
    });

    // 2) revoke 側の失敗 Result を用意する
    const revokeResult: Awaited<
      ReturnType<SessionAuthPort["revokeRefreshTokens"]>
    > = {
      ok: false as const,
      error: {
        // エラー形状を SessionAuthError に寄せるため buildErrorFields を使う
        // - errorId はランダムだが、透過テストなので一致比較しない
        ...buildErrorFields(errorCode.UNAVAILABLE),
        shouldClearSessionCookie: false,
      },
    };

    revokeRefreshTokens.mockResolvedValueOnce(revokeResult);

    // 3) 正常な cookie を渡して revoke まで到達させる
    const result = await revokeAuthSession(deps, {
      sessionCookieValue: "cookie_value",
    });

    // 4) verify は 1 回呼ばれる
    expect(verifySessionUser).toHaveBeenCalledTimes(1);

    // 5) revoke も 1 回呼ばれる
    expect(revokeRefreshTokens).toHaveBeenCalledTimes(1);

    // 6) 返り値は同じ内容で透過される
    expect(result).toEqual(revokeResult);
  });

  it("verifySessionUser と revokeRefreshTokens が成功したら ok({ uid }) を返す", async () => {
    // 1) verify の成功結果を用意する
    // - ここで uid を確定させる
    const sessionUser = { uid: "uid_1" } satisfies SessionUser;

    verifySessionUser.mockResolvedValueOnce({
      ok: true,
      value: sessionUser,
    });

    revokeRefreshTokens.mockResolvedValueOnce({
      ok: true,
      value: null,
    });

    // 2) 正常入力で実行する
    const result = await revokeAuthSession(deps, {
      sessionCookieValue: "cookie_value",
    });

    // 3) verify は 1 回呼ばれる
    expect(verifySessionUser).toHaveBeenCalledTimes(1);
    // 4) revoke も 1 回呼ばれる
    // - 全端末サインアウトのために refresh tokens を revoke する
    expect(revokeRefreshTokens).toHaveBeenCalledTimes(1);

    // 5) 引数は verify で確定した uid
    expect(revokeRefreshTokens).toHaveBeenCalledWith({ uid: "uid_1" });

    // 6) verify と revoke が成功なので Result は成功
    // - 出力は観測用に uid を返す
    expectOkValue(result, { uid: "uid_1" });
  });
});
