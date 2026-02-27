// apps/web/src/backend/identity/applications/get-session-user.usecase.server.test.ts
// ================================================================
// 概要:
// - getSessionUser のユニットテスト
//
// 契約:
// - cookie が空（trim 後に空）なら AUTH_REQUIRED を返し、port は呼ばない
// - port へ渡す cookie は trim 済み
// - port が成功したら ok(value) を返す
// - port の Result は加工せず透過する
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
import type { GetSessionUserDeps } from "./get-session-user.usecase.server";
import { getSessionUser } from "./get-session-user.usecase.server";

describe("getSessionUser", () => {
  const verifySessionUser = vi.fn<SessionAuthPort["verifySessionUser"]>();
  const deps = {
    sessionAuth: { verifySessionUser },
  } satisfies GetSessionUserDeps;

  beforeEach(() => {
    // 1) 各テストの呼び出し回数をリセットする
    verifySessionUser.mockReset();
  });

  it("cookie は trim して port に渡す", async () => {
    const sessionCookieValue = "cookie_value";

    // 1) 最低限の成功戻り値を用意する
    verifySessionUser.mockResolvedValueOnce({
      ok: true,
      value: { uid: "uid_for_trim_check" } satisfies SessionUser,
    });

    // 2) 前後空白つきで入力する
    await getSessionUser(deps, {
      sessionCookieValue: ` ${sessionCookieValue} `,
    });

    // 3) port は 1 回呼ばれる
    expect(verifySessionUser).toHaveBeenCalledTimes(1);

    // 4) 引数は trim 済みで渡される
    expect(verifySessionUser).toHaveBeenCalledWith({
      sessionCookieValue,
    });
  });

  it("cookie が空なら AUTH_REQUIRED を返し、port は呼ばない", async () => {
    // 1) 空白だけの cookie を渡す
    const result = await getSessionUser(deps, {
      sessionCookieValue: "   ",
    });

    // 2) 入力不正なので port は呼ばれない
    expect(verifySessionUser).toHaveBeenCalledTimes(0);

    // 3) Result は失敗
    expectErrCode(result, errorCode.AUTH_REQUIRED, {
      shouldClearSessionCookie: false,
    });
  });

  it("port が失敗したら、その Result を加工せず透過する", async () => {
    // 1) port 側の失敗 Result を用意する
    // - portResult を SessionAuthPort の戻り値型に合わせて作る
    const portResult: Awaited<
      ReturnType<SessionAuthPort["verifySessionUser"]>
    > = {
      ok: false as const,
      error: {
        // - エラー形状を SessionAuthError に寄せるため buildErrorFields を使う
        // - errorId はランダムだが、透過テストなので一致比較しない
        ...buildErrorFields(errorCode.AUTH_INVALID),
        shouldClearSessionCookie: true,
      },
    };

    // 2) port はそのまま返すだけ
    verifySessionUser.mockResolvedValueOnce(portResult);

    // 3) 正常な cookie を渡して port を呼ばせる
    const result = await getSessionUser(deps, {
      sessionCookieValue: "cookie_value",
    });

    // 4) port は 1 回呼ばれる
    expect(verifySessionUser).toHaveBeenCalledTimes(1);

    // 5) 返り値は同じ内容で透過される
    expect(result).toEqual(portResult);
  });

  it("port が成功したら ok(value) を返す", async () => {
    // 1) port の成功結果を用意する
    const sessionUser = { uid: "uid_1" } satisfies SessionUser;

    verifySessionUser.mockResolvedValueOnce({
      ok: true,
      value: sessionUser,
    });

    // 2) 正常な cookie を渡す
    const result = await getSessionUser(deps, {
      sessionCookieValue: "cookie_value",
    });

    // 3) Result は成功で user を返す
    expectOkValue(result, sessionUser);
  });
});
