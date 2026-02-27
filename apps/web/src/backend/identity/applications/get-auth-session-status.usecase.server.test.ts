// apps/web/src/backend/identity/applications/get-auth-session-status.usecase.server.test.ts
// ================================================================
// 概要:
// - getAuthSessionStatus のユニットテスト
//
// 契約:
// - cookie が空（trim 後に空）なら ok(authenticated=false) を返し、port は呼ばない
// - port へ渡す cookie は trim 済み
// - port が AUTH_REQUIRED / AUTH_INVALID を返した場合、ok(authenticated=false) に寄せる
// - それ以外の失敗は加工せず透過する
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionAuthPort } from "@/backend/identity/applications/session-auth.port";
import { expectOkValue } from "@/tests/vitest-utils/utils/result-assertions";
import type { GetAuthSessionStatusDeps } from "./get-auth-session-status.usecase.server";
import { getAuthSessionStatus } from "./get-auth-session-status.usecase.server";

describe("getAuthSessionStatus", () => {
  const verifySessionUser = vi.fn<SessionAuthPort["verifySessionUser"]>();
  const deps = {
    sessionAuth: { verifySessionUser },
  } satisfies GetAuthSessionStatusDeps;

  beforeEach(() => {
    verifySessionUser.mockReset();
  });

  it("cookie は trim して port に渡す", async () => {
    const sessionCookieValue = "cookie_value";

    verifySessionUser.mockResolvedValueOnce({
      ok: true,
      value: { uid: "uid_1" },
    });

    const result = await getAuthSessionStatus(deps, {
      sessionCookieValue: ` ${sessionCookieValue} `,
    });

    expect(verifySessionUser).toHaveBeenCalledTimes(1);
    expect(verifySessionUser).toHaveBeenCalledWith({
      sessionCookieValue,
    });
    expectOkValue(result, {
      authenticated: true,
      uid: "uid_1",
    });
  });

  it("cookie が空なら ok(authenticated=false) を返し、port は呼ばない", async () => {
    const result = await getAuthSessionStatus(deps, {
      sessionCookieValue: "   ",
    });

    expect(verifySessionUser).toHaveBeenCalledTimes(0);
    expectOkValue(result, {
      authenticated: false,
      shouldClearSessionCookie: false,
    });
  });

  it("AUTH_INVALID は ok(authenticated=false) に寄せる", async () => {
    const portResult: Awaited<
      ReturnType<SessionAuthPort["verifySessionUser"]>
    > = {
      ok: false as const,
      error: {
        ...buildErrorFields(errorCode.AUTH_INVALID),
        shouldClearSessionCookie: true,
      },
    };

    verifySessionUser.mockResolvedValueOnce(portResult);

    const result = await getAuthSessionStatus(deps, {
      sessionCookieValue: "cookie_value",
    });

    expect(verifySessionUser).toHaveBeenCalledTimes(1);
    expectOkValue(result, {
      authenticated: false,
      shouldClearSessionCookie: true,
    });
  });

  it("AUTH_REQUIRED は ok(authenticated=false) に寄せる", async () => {
    const portResult: Awaited<
      ReturnType<SessionAuthPort["verifySessionUser"]>
    > = {
      ok: false as const,
      error: {
        ...buildErrorFields(errorCode.AUTH_REQUIRED),
        shouldClearSessionCookie: false,
      },
    };

    verifySessionUser.mockResolvedValueOnce(portResult);

    const result = await getAuthSessionStatus(deps, {
      sessionCookieValue: "cookie_value",
    });

    expect(verifySessionUser).toHaveBeenCalledTimes(1);
    expectOkValue(result, {
      authenticated: false,
      shouldClearSessionCookie: false,
    });
  });

  it("それ以外の失敗は加工せず透過する", async () => {
    const portResult: Awaited<
      ReturnType<SessionAuthPort["verifySessionUser"]>
    > = {
      ok: false as const,
      error: {
        ...buildErrorFields(errorCode.UNAVAILABLE),
        shouldClearSessionCookie: false,
      },
    };

    verifySessionUser.mockResolvedValueOnce(portResult);

    const result = await getAuthSessionStatus(deps, {
      sessionCookieValue: "cookie_value",
    });

    expect(verifySessionUser).toHaveBeenCalledTimes(1);
    expect(result).toEqual(portResult);
  });
});
