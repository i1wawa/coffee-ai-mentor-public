// apps/web/src/app/api/auth/session/route.server.test.ts
// ========================================================
// 概要:
// - GET /api/auth/session の Route Handler 単体テスト
//
// 目的:
// - getAuthSessionStatus が失敗（!status.ok）した分岐の契約を固定する
//
// 前提:
// 1) GET の未認証系以外エラー（400/429/500/503）は
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
import { getAuthSessionStatus } from "@/backend/identity/applications/get-auth-session-status.usecase.server";
import { SESSION_COOKIE_NAME } from "@/backend/shared/http/cookies";
import { expectApiErrJsonResponse } from "@/tests/vitest-utils/integration/utils/http-assertions";
import { GET } from "./route";

vi.mock("@/backend/composition/identity.composition.server", () => {
  return {
    createIdentityDeps: vi.fn(() => {
      return {
        getAuthSessionStatusDeps: { name: "deps_for_get_auth_session_status" },
      };
    }),
  };
});

vi.mock(
  "@/backend/identity/applications/get-auth-session-status.usecase.server",
  () => {
    return {
      getAuthSessionStatus: vi.fn(),
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

describe("GET /api/auth/session (Route Handler 単体)", () => {
  const mockedGetAuthSessionStatus = vi.mocked(getAuthSessionStatus);

  beforeEach(() => {
    mockedGetAuthSessionStatus.mockReset();
  });

  it("照会失敗（!status.ok）では 503 + ok=false + no-store を返す", async () => {
    // 1) usecase 失敗を用意する
    mockedGetAuthSessionStatus.mockResolvedValueOnce(
      err({
        ...buildErrorFields(errorCode.UNAVAILABLE),
        shouldClearSessionCookie: false,
      }),
    );

    // 2) GET を実行する
    const request = new NextRequest("https://example.test/api/auth/session", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=dummy`,
      },
    });
    const response = await GET(request);

    // 3) HTTP 契約を検証する
    await expectApiErrJsonResponse(response, {
      status: 503,
      errorCode: errorCode.UNAVAILABLE,
    });
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");

    // 4) 削除 cookie は返さない
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
