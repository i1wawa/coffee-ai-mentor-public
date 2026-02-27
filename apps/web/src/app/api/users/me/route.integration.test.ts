// apps/web/src/app/api/users/me/route.integration.test.ts
// ========================================================
// 概要:
// - 統合（HTTP境界）テスト: GET /api/users/me, DELETE /api/users/me
//
// 代表シナリオ（GET）:
// - 異常に長い cookie: 401(AUTH_INVALID) + 削除 Set-Cookie
// - cookie 無し: 401(AUTH_REQUIRED) + Set-Cookie なし
// - cookie 不正値: 401(AUTH_INVALID) + 削除 Set-Cookie
// - 有効cookie: 200 + ok/data.uid
//
// 代表シナリオ（DELETE）:
// - unsafe method 防御: 403(ACCESS_DENIED) + Set-Cookie なし
// - 異常に長い cookie: 401(AUTH_INVALID) + 削除 Set-Cookie
// - cookie 無し: 401(AUTH_REQUIRED) + Set-Cookie なし
// - cookie 不正値: 401(AUTH_INVALID) + 削除 Set-Cookie
// - 成功: 200 + ok/deleted=true + 削除 Set-Cookie
//
// 注意:
// - PRECONDITION_FAILED の HTTP 契約は Route 単体テストで固定する
//   - 統合（Auth Emulator 経由）では安定再現しにくいため
// - 全契約の一覧は contracts/src/users/users-me.http.md を参照する
// ========================================================

/* @vitest-environment node */

import { USER_PATHS } from "@contracts/src/users/users-contract";
import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import {
  createTestFailureError,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import { beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "@/backend/shared/http/cookies";
import { MAX_SESSION_COOKIE_CHARS } from "@/backend/shared/http/request.guard.server";
import { createVerifiedTestUserAndFetchIdToken } from "@/tests/utils/auth-emulator";
import { assertSessionCookieDeletionAttributes } from "@/tests/utils/session-cookie-assertions";
import { buildUnsafeMethodSameOriginHeadersForFetch } from "@/tests/vitest-utils/integration/utils/auth-requests-for-fetch";
import { issueSessionOverHttp } from "@/tests/vitest-utils/integration/utils/auth-session";
import {
  getCookiesForJar,
  getCookieValueFromJar,
  setCookieForJar,
} from "@/tests/vitest-utils/integration/utils/cookie-jar";
import {
  createHttpTestClient,
  type HttpTestClient,
  resolveTestUrl,
} from "@/tests/vitest-utils/integration/utils/http";
import {
  expectApiErrJsonResponse,
  expectApiOkJsonResponse,
  expectNoStoreCacheControl,
} from "@/tests/vitest-utils/integration/utils/http-assertions";
import { getSetCookiesFromFetchResponse } from "@/tests/vitest-utils/integration/utils/set-cookie";

const meUrl = resolveTestUrl(USER_PATHS.me);
const jarUrl = resolveTestUrl("/");
let testClient: HttpTestClient;

async function fetchUserMeWithStolenCookie(params: {
  sessionCookieValue: string;
}): Promise<Response> {
  const cookieHeaderValue = `${SESSION_COOKIE_NAME}=${params.sessionCookieValue}`;

  return await fetch(meUrl, {
    method: "GET",
    redirect: "manual",
    headers: { Cookie: cookieHeaderValue },
  });
}

describe("GET /api/users/me (統合 / HTTP境界)", () => {
  beforeEach(() => {
    testClient = createHttpTestClient();
  });

  it("異常に長い cookie: 異常に長い cookie は AUTH_INVALID + 削除 Set-Cookie", async () => {
    // 1) 巨大cookieを Cookie ヘッダで直送する
    // - CookieJar は巨大cookieを保持できないことがあるため
    const tooLongCookieValue = "a".repeat(MAX_SESSION_COOKIE_CHARS + 1);
    const response = await fetch(meUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${tooLongCookieValue}`,
        accept: "application/json",
      },
    });
    expectNoStoreCacheControl(response);

    // 2) 401 + AUTH_INVALID
    await expectApiErrJsonResponse(response, {
      status: 401,
      errorCode: errorCode.AUTH_INVALID,
    });

    // 3) 削除 Set-Cookie を返すこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(setCookies);
  });

  it("cookie 無し: cookie 無しは AUTH_REQUIRED + Set-Cookie なし", async () => {
    // 1) cookie を持たない状態で実サーバへ
    const response = await testClient.cookieFetch(meUrl, {
      method: "GET",
      redirect: "manual",
    });
    expectNoStoreCacheControl(response);

    // 2) AUTH_REQUIRED を確認する
    await expectApiErrJsonResponse(response, {
      status: 401,
      errorCode: errorCode.AUTH_REQUIRED,
    });

    // 3) cookie無しでは Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("cookie 不正値: 不正な cookie は AUTH_INVALID + 削除 Set-Cookie", async () => {
    // 1) 無効な cookie を注入
    // - cookie名は実装依存になりやすいので代表例のみを使う
    await setCookieForJar(
      {
        url: jarUrl,
        cookie: `${SESSION_COOKIE_NAME}=invalid-session-cookie; Path=/; HttpOnly; Secure`,
      },
      testClient.cookieJar,
    );

    // 1.1) 注入できたつもりを排除する
    const cookies = await getCookiesForJar(meUrl, testClient.cookieJar);
    const hasSessionCookie = cookies.some((c) => c.key === SESSION_COOKIE_NAME);
    if (!hasSessionCookie) {
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary:
          "テストがSESSION_COOKIE_NAME 不正値をCookieJarに注入できていません。",
        expected: `CookieJarに ${SESSION_COOKIE_NAME} が存在する`,
        observed: `cookies=${JSON.stringify(cookies)}`,
        nextActions: [
          "url/jarUrl の host/protocol/port が一致しているか確認する",
          "resolveTestUrl のベースURLが HTTPS の 127.0.0.1 になっているか確認する",
        ],
      });
    }

    // 2) 実サーバへ
    const response = await testClient.cookieFetch(meUrl, {
      method: "GET",
      redirect: "manual",
    });
    expectNoStoreCacheControl(response);

    // 3) AUTH_INVALID を確認する
    await expectApiErrJsonResponse(response, {
      status: 401,
      errorCode: errorCode.AUTH_INVALID,
    });

    // 4) 不正cookieでは削除 Set-Cookie を返すこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(setCookies);
  });

  it("成功系: SESSION_COOKIE_NAME 取得後は 200", async () => {
    // 1) HTTP境界で session を発行する
    const sessionResponse = await issueSessionOverHttp({
      cookieFetch: testClient.cookieFetch,
    });
    if (!sessionResponse.ok) {
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary:
          "前提として session 発行（/api/auth/session）が成功する必要があります。",
        expected: "HTTP 2xx",
        observed: `status=${sessionResponse.status}`,
        nextActions: [
          "Next.js側に FIREBASE_AUTH_EMULATOR_HOST が渡っているか確認する",
          "Auth Emulator が起動しているか確認する",
        ],
      });
    }

    // 2) /api/users/me へ（Cookie は自動送信される）
    const response = await testClient.cookieFetch(meUrl, {
      method: "GET",
      redirect: "manual",
    });
    expectNoStoreCacheControl(response);

    // 3) 成功レスポンス契約を確認する
    // - uid の存在だけを契約化しておき、詳細は別途拡張する
    await expectApiOkJsonResponse(response, {
      uid: expect.stringMatching(/\S/),
    });
  });
});

describe("DELETE /api/users/me (統合 / HTTP境界)", () => {
  beforeEach(() => {
    testClient = createHttpTestClient();
  });

  it("unsafe method 防御: cross-site は ACCESS_DENIED + Set-Cookie なし", async () => {
    // 1) cross-site を明示した unsafe method を送る
    const response = await fetch(meUrl, {
      method: "DELETE",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: meUrl }),
        "Sec-Fetch-Site": "cross-site",
      },
    });
    expectNoStoreCacheControl(response);

    // 2) guard で拒否されること
    await expectApiErrJsonResponse(response, {
      status: 403,
      errorCode: errorCode.ACCESS_DENIED,
    });

    // 3) 拒否時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("unsafe method 防御: Origin/Referer 不一致は 403(ACCESS_DENIED) + Set-Cookie なし", async () => {
    // 1) Origin/Referer 不一致を送る
    // - Sec-Fetch-Site を外し、Origin/Referer フォールバック分岐を通す
    const response = await fetch(meUrl, {
      method: "DELETE",
      redirect: "manual",
      headers: {
        Origin: "https://evil.example.com",
        Referer: "https://evil.example.com/attack",
      },
    });
    expectNoStoreCacheControl(response);

    // 2) guard で拒否されること
    await expectApiErrJsonResponse(response, {
      status: 403,
      errorCode: errorCode.ACCESS_DENIED,
    });

    // 3) 拒否時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("異常に長い cookie: 異常に長い cookie は AUTH_INVALID + 削除 Set-Cookie", async () => {
    // 1) 巨大cookieを Cookie ヘッダで直送する
    // - CookieJar は巨大cookieを保持できないことがあるため
    const tooLongCookieValue = "a".repeat(MAX_SESSION_COOKIE_CHARS + 1);
    const response = await fetch(meUrl, {
      method: "DELETE",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: meUrl }),
        Cookie: `${SESSION_COOKIE_NAME}=${tooLongCookieValue}`,
      },
    });
    expectNoStoreCacheControl(response);

    // 2) AUTH_INVALID
    await expectApiErrJsonResponse(response, {
      status: 401,
      errorCode: errorCode.AUTH_INVALID,
    });

    // 3) 削除 Set-Cookie を返すこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(setCookies);
  });

  it("cookie 無し: cookie 無しは AUTH_REQUIRED + Set-Cookie なし", async () => {
    // 1) cookie無しで削除を実行する
    const response = await testClient.cookieFetch(meUrl, {
      method: "DELETE",
      redirect: "manual",
      headers: buildUnsafeMethodSameOriginHeadersForFetch({ url: meUrl }),
    });
    expectNoStoreCacheControl(response);

    // 2) AUTH_REQUIRED を確認する
    await expectApiErrJsonResponse(response, {
      status: 401,
      errorCode: errorCode.AUTH_REQUIRED,
    });

    // 3) cookie無しでは Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("失敗系: 不正な cookie は AUTH_INVALID + 削除 Set-Cookie", async () => {
    // 1) 無効な cookie を注入する
    await setCookieForJar(
      {
        url: jarUrl,
        cookie: `${SESSION_COOKIE_NAME}=invalid-session-cookie; Path=/; HttpOnly; Secure`,
      },
      testClient.cookieJar,
    );

    // 1.1) 注入できたつもりを排除する
    const cookies = await getCookiesForJar(meUrl, testClient.cookieJar);
    const hasSessionCookie = cookies.some(
      (cookie) => cookie.key === SESSION_COOKIE_NAME,
    );
    if (!hasSessionCookie) {
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary:
          "テストがSESSION_COOKIE_NAME 不正値をCookieJarに注入できていません。",
        expected: `CookieJarに ${SESSION_COOKIE_NAME} が存在する`,
        observed: `cookies=${JSON.stringify(cookies)}`,
        nextActions: [
          "url/jarUrl の host/protocol/port が一致しているか確認する",
          "resolveTestUrl のベースURLが HTTPS の 127.0.0.1 になっているか確認する",
        ],
      });
    }

    // 2) 削除を実行する
    const response = await testClient.cookieFetch(meUrl, {
      method: "DELETE",
      redirect: "manual",
      headers: buildUnsafeMethodSameOriginHeadersForFetch({ url: meUrl }),
    });
    expectNoStoreCacheControl(response);

    // 3) AUTH_INVALID
    await expectApiErrJsonResponse(response, {
      status: 401,
      errorCode: errorCode.AUTH_INVALID,
    });

    // 4) 削除 Set-Cookie を返すこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(setCookies);
  });

  it("成功系: 成功で削除Set-Cookie を返し、盗まれた cookie でも /api/users/me が 401 になる", async () => {
    // 1) recent login 判定のため、直近の idToken を取得する
    const idToken = await createVerifiedTestUserAndFetchIdToken();

    // 2) session cookie を発行する
    const issueResponse = await issueSessionOverHttp({
      idToken,
      cookieFetch: testClient.cookieFetch,
    });
    if (!issueResponse.ok) {
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary: "前提の session 発行が失敗しました。",
        expected: "HTTP 2xx + Set-Cookie",
        observed: `status=${issueResponse.status}`,
        nextActions: ["Auth Emulator の起動状況を確認する"],
      });
    }

    // 3) 盗難コピーを想定して cookie を退避する
    const stolenSessionCookieValue = await getCookieValueFromJar(
      {
        url: meUrl,
        cookieName: SESSION_COOKIE_NAME,
      },
      testClient.cookieJar,
    );
    if (!stolenSessionCookieValue) {
      const cookies = await getCookiesForJar(meUrl, testClient.cookieJar);
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary: "CookieJar から session cookie を取得できません。",
        expected: `CookieJar に ${SESSION_COOKIE_NAME} が存在する`,
        observed: `cookies=${JSON.stringify(cookies)}`,
        nextActions: ["session 発行が成功しているか確認する"],
      });
    }

    // 4) 削除を実行する
    // - unsafe method 防御を通すため、最低限のヘッダを付与する
    const deleteResponse = await testClient.cookieFetch(meUrl, {
      method: "DELETE",
      redirect: "manual",
      headers: buildUnsafeMethodSameOriginHeadersForFetch({ url: meUrl }),
    });
    expectNoStoreCacheControl(deleteResponse);

    if (!deleteResponse.ok) {
      const body = await deleteResponse.text().catch(() => "");
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary: "アカウント削除は成功レスポンスを返すべきです。",
        expected: "HTTP 2xx + 削除Set-Cookie",
        observed: `status=${deleteResponse.status} body=${body.slice(0, 200)}`,
        nextActions: ["Route 実装と依存設定を確認する"],
      });
    }

    // 5) 削除 Set-Cookie を返すこと
    const deleteSetCookies = getSetCookiesFromFetchResponse(deleteResponse);
    expect(deleteSetCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(deleteSetCookies);

    // 6) 盗難コピーを送って /api/users/me を叩く
    const userMeAfterStolen = await fetchUserMeWithStolenCookie({
      sessionCookieValue: stolenSessionCookieValue,
    });
    expectNoStoreCacheControl(userMeAfterStolen);

    expect(userMeAfterStolen.status).toBe(401);
  });
});
