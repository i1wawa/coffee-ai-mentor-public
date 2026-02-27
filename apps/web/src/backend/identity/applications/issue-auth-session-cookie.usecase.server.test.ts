// apps/web/src/backend/identity/applications/issue-auth-session-cookie.usecase.server.test.ts
// ================================================================
// 概要:
// - issueAuthSessionCookie のユニットテスト
//
// 契約:
// - idToken は trim 後に必須。空なら VALIDATION_FAILED を返し、port は呼ばない
// - expiresInMs は有限数かつ 0 より大きい値が必須。不正なら VALIDATION_FAILED を返し、port は呼ばない
// - idToken は trim して port に渡す
// - 正常系では port を呼び、maxAgeSeconds は floor(expiresInMs / 1000) で計算される
// - port の Result は加工せず、そのまま透過する
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionAuthPort } from "@/backend/identity/applications/session-auth.port";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import type { IssueAuthSessionCookieDeps } from "./issue-auth-session-cookie.usecase.server";
import { issueAuthSessionCookie } from "./issue-auth-session-cookie.usecase.server";

describe("issueSessionCookie", () => {
  const issueSessionCookiePort = vi.fn<SessionAuthPort["issueSessionCookie"]>();
  const deps = {
    sessionAuth: {
      issueSessionCookie: issueSessionCookiePort,
    },
  } satisfies IssueAuthSessionCookieDeps;

  beforeEach(() => {
    issueSessionCookiePort.mockReset();
  });

  it("idToken は trim して port に渡す", async () => {
    const idToken = "id_token";

    // 1) 最低限の成功戻り値を用意する
    issueSessionCookiePort.mockResolvedValueOnce({
      ok: true,
      value: {
        sessionCookieValue: "cookie_for_trim_check",
      },
    });

    // 2) 前後空白つき token で呼ぶ
    await issueAuthSessionCookie(deps, {
      idToken: ` ${idToken} `,
      expiresInMs: 1000,
    });

    // 3) 引数は trim 済み token
    expect(issueSessionCookiePort).toHaveBeenCalledTimes(1);
    expect(issueSessionCookiePort).toHaveBeenCalledWith({
      idToken,
      expiresInMs: 1000,
    });
  });

  it("idToken が空なら VALIDATION_FAILED を返し、port は呼ばない", async () => {
    // 1) 空白だけの token を渡す
    const result = await issueAuthSessionCookie(deps, {
      idToken: "   ",
      expiresInMs: 1000,
    });

    // 2) 入力不正なので port は呼ばれない
    expect(issueSessionCookiePort).toHaveBeenCalledTimes(0);

    // 3) Result は失敗
    expectErrCode(result, errorCode.VALIDATION_FAILED, {
      shouldClearSessionCookie: false,
    });
  });

  it("expiresInMs が有限数でない、または 0 以下なら VALIDATION_FAILED を返し、port は呼ばない", async () => {
    // 1) NaN
    {
      const result = await issueAuthSessionCookie(deps, {
        idToken: "token",
        expiresInMs: Number.NaN,
      });

      expectErrCode(result, errorCode.VALIDATION_FAILED, {
        shouldClearSessionCookie: false,
      });
    }

    // 2) Infinity
    {
      const result = await issueAuthSessionCookie(deps, {
        idToken: "token",
        expiresInMs: Number.POSITIVE_INFINITY,
      });

      expectErrCode(result, errorCode.VALIDATION_FAILED, {
        shouldClearSessionCookie: false,
      });
    }

    // 3) 0
    {
      const result = await issueAuthSessionCookie(deps, {
        idToken: "token",
        expiresInMs: 0,
      });

      expectErrCode(result, errorCode.VALIDATION_FAILED, {
        shouldClearSessionCookie: false,
      });
    }

    // 4) 負数
    {
      const result = await issueAuthSessionCookie(deps, {
        idToken: "token",
        expiresInMs: -1,
      });

      expectErrCode(result, errorCode.VALIDATION_FAILED, {
        shouldClearSessionCookie: false,
      });
    }

    // 5) 入力不正なので port は一度も呼ばれない
    expect(issueSessionCookiePort).toHaveBeenCalledTimes(0);
  });

  it("正常系は port を呼び、maxAgeSeconds を floor(expiresInMs / 1000) で返す", async () => {
    // 1) port 成功結果を用意する
    issueSessionCookiePort.mockResolvedValueOnce({
      ok: true,
      value: {
        sessionCookieValue: "session_cookie_value",
      },
    });

    // 2) 小数秒が出る expiresInMs を用意する
    const expiresInMs = 5500;

    // 3) 正常な token で呼ぶ
    const result = await issueAuthSessionCookie(deps, {
      idToken: "id_token",
      expiresInMs,
    });

    // 4) port は 1 回呼ばれる
    expect(issueSessionCookiePort).toHaveBeenCalledTimes(1);

    // 5) port へ入力を渡す
    expect(issueSessionCookiePort).toHaveBeenCalledWith({
      idToken: "id_token",
      expiresInMs,
    });

    // 6) Result は成功で、値は usecase の形に整形されて返る
    expectOkValue(result, {
      sessionCookieValue: "session_cookie_value",
      maxAgeSeconds: 5,
    });
  });

  it("port が失敗したら、その Result を加工せず透過する", async () => {
    // 1) port 側の失敗 Result を用意する
    const portResult: Awaited<
      ReturnType<SessionAuthPort["issueSessionCookie"]>
    > = {
      ok: false as const,
      error: {
        // エラー形状を SessionAuthError に寄せるため buildErrorFields を使う
        // - errorId はランダムだが、透過テストなので一致比較しない
        ...buildErrorFields(errorCode.AUTH_INVALID),
        shouldClearSessionCookie: true,
      },
    };

    // 2) port はそのまま返す
    issueSessionCookiePort.mockResolvedValueOnce(portResult);

    // 3) 正常な入力で port を呼ばせる
    const result = await issueAuthSessionCookie(deps, {
      idToken: "id_token",
      expiresInMs: 1000,
    });

    // 4) port は 1 回呼ばれる
    expect(issueSessionCookiePort).toHaveBeenCalledTimes(1);

    // 5) 返り値は同じ内容で透過される
    expect(result).toEqual(portResult);
  });
});
