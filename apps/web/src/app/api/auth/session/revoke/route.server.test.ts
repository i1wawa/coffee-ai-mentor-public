// apps/web/src/app/api/auth/session/revoke/route.server.test.ts
// ========================================================
// 概要:
// - POST /api/auth/session/revoke の Route Handler 単体テスト
//
// 責務:
// - revokeAuthSession が未認証系以外で失敗したときの HTTP 契約を代表1ケースで固定する
//   - status と errorCode の対応
//   - no-store
//   - 削除 Set-Cookie を返すこと
//
// 前提:
// 1) revoke の未認証系以外エラー（400/429/500/503）は
//    Auth Emulator 経由の統合テストで安定再現しにくい
// 2) そのため、Route 単体で usecase の返り値を固定し、HTTP 契約だけを確実に検証する
// ========================================================

/* @vitest-environment node */

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err } from "@packages/shared/src/result";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revokeAuthSession } from "@/backend/identity/applications/revoke-auth-session.usecase.server";
import { SESSION_COOKIE_NAME } from "@/backend/shared/http/cookies";
import { assertSessionCookieDeletionAttributes } from "@/tests/utils/session-cookie-assertions";
import { expectApiErrJsonResponse } from "@/tests/vitest-utils/integration/utils/http-assertions";
import { getSetCookiesFromFetchResponse } from "@/tests/vitest-utils/integration/utils/set-cookie";
import { POST } from "./route";

vi.mock("@/backend/composition/identity.composition.server", () => {
  return {
    createIdentityDeps: vi.fn(() => {
      return {
        revokeAuthSessionDeps: { name: "deps_for_revoke_auth_session" },
      };
    }),
  };
});

vi.mock(
  "@/backend/identity/applications/revoke-auth-session.usecase.server",
  () => {
    return {
      revokeAuthSession: vi.fn(),
    };
  },
);

vi.mock("@/backend/shared/observability/request-summary", () => {
  return {
    runRouteHandlerWithRequestSummary: vi.fn(
      async (
        request: Request,
        _options: unknown,
        handler: (request: Request) => Promise<unknown>,
      ) => {
        const result = await handler(request);
        if (result instanceof Response) return result;
        if (
          result &&
          typeof result === "object" &&
          "value" in result &&
          (result as { value: unknown }).value instanceof Response
        ) {
          return (result as { value: Response }).value;
        }
        throw new Error(
          "test setup error: route handler callback did not return Response",
        );
      },
    ),
  };
});

describe("POST /api/auth/session/revoke (Route Handler 単体)", () => {
  const mockedRevokeAuthSession = vi.mocked(revokeAuthSession);

  beforeEach(() => {
    mockedRevokeAuthSession.mockReset();
  });

  it("未認証系以外の失敗（UNAVAILABLE）では UNAVAILABLE + ok=false + no-store + 削除 Set-Cookie を返す", async () => {
    // 1) usecase 失敗を用意する
    const expectedErrorCode = errorCode.UNAVAILABLE;
    const expectedStatus = 503;
    mockedRevokeAuthSession.mockResolvedValueOnce(
      err({
        ...buildErrorFields(expectedErrorCode),
        shouldClearSessionCookie: false,
      }),
    );

    // 2) POST を実行する
    // - unsafe method 防御を通すため、同一オリジン系ヘッダを付与する
    const request = new NextRequest(
      "https://example.test/api/auth/session/revoke",
      {
        method: "POST",
        headers: {
          Host: "example.test",
          Origin: "https://example.test",
          Referer: "https://example.test/",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Dest": "empty",
          cookie: `${SESSION_COOKIE_NAME}=dummy`,
        },
      },
    );
    const response = await POST(request);

    // 3) HTTP 契約を検証する
    await expectApiErrJsonResponse(response, {
      status: expectedStatus,
      errorCode: expectedErrorCode,
    });
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");

    // 4) 失敗時でも削除 Set-Cookie を返すこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(setCookies);
  });
});
