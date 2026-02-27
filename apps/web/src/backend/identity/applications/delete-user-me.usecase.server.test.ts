// apps/web/src/backend/identity/applications/delete-user-me.usecase.server.test.ts
// ================================================================
// 概要:
// - deleteUserMe のユニットテスト
//
// 契約:
// - cookie が空（trim 後に空）なら AUTH_REQUIRED を返し、port は呼ばない
// - recentAuthMaxAgeMs が不正なら INTERNAL_ERROR
// - cookie は trim して verifySessionUser に渡す
// - verifySessionUser の失敗は加工せず透過する
// - authTime が無い場合は PRECONDITION_FAILED
// - recent login 不足は PRECONDITION_FAILED（cookie は消さない）
// - 成功時は deleteUser を呼び ok({ uid }) を返す
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { ok } from "@packages/shared/src/result";
import { describe, expect, it, vi } from "vitest";
import type { IdentityAdminPort } from "@/backend/identity/applications/identity-admin.port";
import type { SessionAuthPort } from "@/backend/identity/applications/session-auth.port";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import type { DeleteUserMeDeps } from "./delete-user-me.usecase.server";
import { deleteUserMe } from "./delete-user-me.usecase.server";

describe("deleteUserMe", () => {
  // deleteUserMe のテストコンテキスト生成用
  function createDeleteUserMeTestContext(options?: { nowMs?: number }): {
    deps: DeleteUserMeDeps;
    mocks: {
      verifySessionUser: ReturnType<
        typeof vi.fn<SessionAuthPort["verifySessionUser"]>
      >;
      deleteUser: ReturnType<typeof vi.fn<IdentityAdminPort["deleteUser"]>>;
    };
  } {
    const verifySessionUser = vi.fn<SessionAuthPort["verifySessionUser"]>();
    const deleteUser = vi.fn<IdentityAdminPort["deleteUser"]>();

    const deps = {
      sessionAuth: { verifySessionUser },
      identityAdmin: { deleteUser },
      clock: { nowMs: () => options?.nowMs ?? Date.now() },
    } satisfies DeleteUserMeDeps;

    return { deps, mocks: { verifySessionUser, deleteUser } };
  }

  it("cookie は trim して verifySessionUser に渡す", async () => {
    const sessionCookieValue = "cookie_value";
    const { deps, mocks } = createDeleteUserMeTestContext();

    const portResult: Awaited<
      ReturnType<SessionAuthPort["verifySessionUser"]>
    > = {
      ok: false as const,
      error: {
        ...buildErrorFields(errorCode.AUTH_INVALID),
        shouldClearSessionCookie: true,
      },
    };
    mocks.verifySessionUser.mockResolvedValueOnce(portResult);

    const result = await deleteUserMe(deps, {
      sessionCookieValue: ` ${sessionCookieValue} `,
      recentAuthMaxAgeMs: 5 * 60 * 1000,
    });

    expect(mocks.verifySessionUser).toHaveBeenCalledTimes(1);
    expect(mocks.verifySessionUser).toHaveBeenCalledWith({
      sessionCookieValue,
    });
    expect(mocks.deleteUser).toHaveBeenCalledTimes(0);
    expect(result).toEqual(portResult);
  });

  it("cookie が空なら AUTH_REQUIRED を返し、port は呼ばない", async () => {
    const { deps, mocks } = createDeleteUserMeTestContext();

    const result = await deleteUserMe(deps, {
      sessionCookieValue: "   ",
      recentAuthMaxAgeMs: 5 * 60 * 1000,
    });

    expect(mocks.verifySessionUser).toHaveBeenCalledTimes(0);
    expect(mocks.deleteUser).toHaveBeenCalledTimes(0);

    expectErrCode(result, errorCode.AUTH_REQUIRED, {
      shouldClearSessionCookie: false,
    });
  });

  it("recentAuthMaxAgeMs が不正なら INTERNAL_ERROR", async () => {
    const { deps, mocks } = createDeleteUserMeTestContext();

    const result = await deleteUserMe(deps, {
      sessionCookieValue: "cookie_value",
      recentAuthMaxAgeMs: 0,
    });

    expect(mocks.verifySessionUser).toHaveBeenCalledTimes(0);
    expect(mocks.deleteUser).toHaveBeenCalledTimes(0);

    expectErrCode(result, errorCode.INTERNAL_ERROR, {
      shouldClearSessionCookie: false,
    });
  });

  it("verifySessionUser が失敗したら、その Result を加工せず透過する", async () => {
    const { deps, mocks } = createDeleteUserMeTestContext();

    const portResult: Awaited<
      ReturnType<SessionAuthPort["verifySessionUser"]>
    > = {
      ok: false as const,
      error: {
        ...buildErrorFields(errorCode.AUTH_INVALID),
        shouldClearSessionCookie: true,
      },
    };
    mocks.verifySessionUser.mockResolvedValueOnce(portResult);

    const result = await deleteUserMe(deps, {
      sessionCookieValue: "cookie_value",
      recentAuthMaxAgeMs: 5 * 60 * 1000,
    });

    expect(mocks.verifySessionUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledTimes(0);
    expect(result).toEqual(portResult);
  });

  it("authTime が無い場合は PRECONDITION_FAILED", async () => {
    const { deps, mocks } = createDeleteUserMeTestContext({ nowMs: 1000 });

    mocks.verifySessionUser.mockResolvedValueOnce(
      ok({
        uid: "uid_1",
      }),
    );

    const result = await deleteUserMe(deps, {
      sessionCookieValue: "cookie_value",
      recentAuthMaxAgeMs: 5 * 60 * 1000,
    });

    expect(mocks.verifySessionUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledTimes(0);

    expectErrCode(result, errorCode.PRECONDITION_FAILED, {
      shouldClearSessionCookie: false,
    });
  });

  it("recent login 不足は PRECONDITION_FAILED", async () => {
    const { deps, mocks } = createDeleteUserMeTestContext({
      nowMs: 6 * 60 * 1000 + 1,
    });

    mocks.verifySessionUser.mockResolvedValueOnce(
      ok({
        uid: "uid_1",
        authTimeSeconds: 0,
      }),
    );

    const result = await deleteUserMe(deps, {
      sessionCookieValue: "cookie_value",
      recentAuthMaxAgeMs: 5 * 60 * 1000,
    });

    expect(mocks.verifySessionUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledTimes(0);

    expectErrCode(result, errorCode.PRECONDITION_FAILED, {
      shouldClearSessionCookie: false,
    });
  });

  it("成功時は deleteUser を呼び ok({ uid }) を返す", async () => {
    const { deps, mocks } = createDeleteUserMeTestContext({ nowMs: 1000 });

    mocks.verifySessionUser.mockResolvedValueOnce(
      ok({
        uid: "uid_1",
        authTimeSeconds: 1,
      }),
    );
    mocks.deleteUser.mockResolvedValueOnce(ok(null));

    const result = await deleteUserMe(deps, {
      sessionCookieValue: "cookie_value",
      recentAuthMaxAgeMs: 5 * 60 * 1000,
    });

    expect(mocks.verifySessionUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledWith({ uid: "uid_1" });
    expectOkValue(result, { uid: "uid_1" });
  });
});
