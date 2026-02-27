// apps/web/src/app/api/auth/session/route.integration.test.ts
// ========================================================
// 概要:
// - 統合（HTTP境界）テスト: GET /api/auth/session, POST /api/auth/session, DELETE /api/auth/session
//
// 代表シナリオ（GET）:
// - 異常に長い cookie: 200 + authenticated=false + 削除 Set-Cookie
// - cookie 無し: 200 + authenticated=false + Set-Cookie なし
// - cookie 不正値: 200 + authenticated=false + 削除 Set-Cookie
// - 有効cookie: 200 + authenticated=true + user.uid
//
// 代表シナリオ（POST）:
// - unsafe method 防御: 403(ACCESS_DENIED) + Set-Cookie なし
// - 入力バリデーション失敗: 400(VALIDATION_FAILED) + Set-Cookie なし
// - idToken 不正: 401(AUTH_INVALID) + Set-Cookie なし
// - 未確認メール idToken: 403(ACCESS_DENIED) + Set-Cookie なし
// - 成功: 200 + ok/issued=true + セッション Set-Cookie
//
// 代表シナリオ（DELETE）:
// - unsafe method 防御: 403(ACCESS_DENIED) + Set-Cookie なし
// - cookie 無しでも成功: 200 + ok/cleared=true + 削除 Set-Cookie
// - 成功: 200 + ok/cleared=true + 削除 Set-Cookie
// - 削除後の確認: 以後 /api/users/me は 401
//
// 注意:
// - 全契約の一覧は contracts/src/auth/auth-session.http.md を参照する
// ========================================================

/* @vitest-environment node */

import { AUTH_PATHS } from "@contracts/src/auth/auth-contract";
import { USER_PATHS } from "@contracts/src/users/users-contract";
import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import {
  createTestFailureError,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import { beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "@/backend/shared/http/cookies";
import {
  MAX_JSON_BODY_BYTES,
  MAX_SESSION_COOKIE_CHARS,
} from "@/backend/shared/http/request.guard.server";
import { createTestUserAndFetchIdToken } from "@/tests/utils/auth-emulator";
import {
  assertSessionCookieAttributes,
  assertSessionCookieDeletionAttributes,
} from "@/tests/utils/session-cookie-assertions";
import { buildUnsafeMethodSameOriginHeadersForFetch } from "@/tests/vitest-utils/integration/utils/auth-requests-for-fetch";
import {
  deleteSessionOverHttp,
  getSessionStatusOverHttp,
  issueSessionOverHttp,
} from "@/tests/vitest-utils/integration/utils/auth-session";
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

const sessionUrl = resolveTestUrl(AUTH_PATHS.session);
let testClient: HttpTestClient;

describe("GET /api/auth/session (統合 / HTTP境界)", () => {
  beforeEach(() => {
    testClient = createHttpTestClient();
  });

  it("異常に長い cookie: 異常に長い cookie は authenticated=false + 削除Set-Cookie を返す", async () => {
    // 1) 異常に長い cookie を用意する
    // - CookieJar は巨大cookieを保持できないことがあるため、HTTPリクエストの Cookie ヘッダで直接送る
    const tooLongCookieValue = "a".repeat(MAX_SESSION_COOKIE_CHARS + 1);

    // 2) API を呼ぶ
    const response = await fetch(sessionUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${tooLongCookieValue}`,
        accept: "application/json",
      },
    });
    expectNoStoreCacheControl(response);

    // 3) 成功レスポンス契約を確認する
    await expectApiOkJsonResponse(response, {
      authenticated: false,
      user: null,
    });

    // 4) 削除 Set-Cookie を返すこと
    // - 以後のリクエストで無効cookieが送られ続けるのを防ぐ
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(setCookies);
  });

  it("未サインイン: 未サインインでも 200 + authenticated=false を返す", async () => {
    // 1) API を呼ぶ
    const response = await getSessionStatusOverHttp({
      cookieFetch: testClient.cookieFetch,
    });
    expectNoStoreCacheControl(response);

    // 2) 成功レスポンス契約を確認する
    await expectApiOkJsonResponse(response, {
      authenticated: false,
      user: null,
    });
  });

  it("cookie 不正値: 不正な cookie でも 200 + authenticated=false + 削除Set-Cookie を返す", async () => {
    // 1) 無効な cookie を注入する
    const jarUrl = resolveTestUrl("/");
    await setCookieForJar(
      {
        url: jarUrl,
        cookie: `${SESSION_COOKIE_NAME}=invalid-session-cookie; Path=/; HttpOnly; Secure`,
      },
      testClient.cookieJar,
    );

    // 1.1) 注入できたつもりを排除する
    const cookies = await getCookiesForJar(sessionUrl, testClient.cookieJar);
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

    // 2) API を呼ぶ
    const response = await getSessionStatusOverHttp({
      cookieFetch: testClient.cookieFetch,
    });
    expectNoStoreCacheControl(response);

    // 3) 成功レスポンス契約を確認する
    await expectApiOkJsonResponse(response, {
      authenticated: false,
      user: null,
    });

    // 4) 削除 Set-Cookie を返すこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(setCookies);
  });

  it("サインイン済み: サインイン済みなら 200 + authenticated=true を返す", async () => {
    // 1) 事前にサインイン状態を作る（CookieJar に session cookie が入る想定）
    const issueResponse = await issueSessionOverHttp({
      cookieFetch: testClient.cookieFetch,
    });
    if (!issueResponse.ok) {
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary: "前提の session 発行が失敗しました。",
        expected: "HTTP 2xx + Set-Cookie",
        observed: `status=${issueResponse.status}`,
        nextActions: [
          "Auth Emulator が起動しているか確認する",
          "Next.js側に FIREBASE_AUTH_EMULATOR_HOST が渡っているか確認する",
        ],
      });
    }

    // 2) API を呼ぶ
    const response = await getSessionStatusOverHttp({
      cookieFetch: testClient.cookieFetch,
    });
    expectNoStoreCacheControl(response);

    // 3) 成功レスポンス契約を確認する
    await expectApiOkJsonResponse(response, {
      authenticated: true,
      user: {
        uid: expect.stringMatching(/\S/),
      },
    });
  });
});

describe("POST /api/auth/session (統合 / HTTP境界)", () => {
  beforeEach(() => {
    testClient = createHttpTestClient();
  });

  it("unsafe method 防御: cross-site は ACCESS_DENIED で拒否し、Set-Cookie を返さない", async () => {
    // 1) cross-site を明示した unsafe method を送る
    const response = await fetch(sessionUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: sessionUrl }),
        "Sec-Fetch-Site": "cross-site",
        "content-type": "application/json",
      },
      body: JSON.stringify({ idToken: "dummy-id-token" }),
    });

    // 2) guard で拒否されること
    await expectApiErrJsonResponse(response, {
      status: 403,
      errorCode: errorCode.ACCESS_DENIED,
    });
    expectNoStoreCacheControl(response);

    // 3) 拒否時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("unsafe method 防御: Origin/Referer 不一致は ACCESS_DENIED で拒否し、Set-Cookie を返さない", async () => {
    // 1) Origin/Referer 不一致を送る
    // - Sec-Fetch-Site を外し、Origin/Referer フォールバック分岐を通す
    const response = await fetch(sessionUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        Origin: "https://evil.example.com",
        Referer: "https://evil.example.com/attack",
        "content-type": "application/json",
      },
      body: JSON.stringify({ idToken: "dummy-id-token" }),
    });

    // 2) guard で拒否されること
    await expectApiErrJsonResponse(response, {
      status: 403,
      errorCode: errorCode.ACCESS_DENIED,
    });
    expectNoStoreCacheControl(response);

    // 3) 拒否時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("Content-Type 検証: Content-Type が JSON 以外なら VALIDATION_FAILED で拒否し、Set-Cookie を返さない", async () => {
    // 1) text/plain で送る
    const response = await fetch(sessionUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: sessionUrl }),
        "content-type": "text/plain",
      },
      body: "idToken=dummy-id-token",
    });

    // 2) validation 失敗で落ちること
    await expectApiErrJsonResponse(response, {
      status: 400,
      errorCode: errorCode.VALIDATION_FAILED,
    });
    expectNoStoreCacheControl(response);

    // 3) 失敗時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("Content-Length 検証: 大きすぎる JSON body は VALIDATION_FAILED で拒否し、Set-Cookie を返さない", async () => {
    // 1) 上限を超える body を送る
    const tooLongBody = JSON.stringify({
      idToken: "a".repeat(MAX_JSON_BODY_BYTES + 1),
    });
    const response = await fetch(sessionUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: sessionUrl }),
        "content-type": "application/json",
      },
      body: tooLongBody,
    });

    // 2) validation 失敗で落ちること
    await expectApiErrJsonResponse(response, {
      status: 400,
      errorCode: errorCode.VALIDATION_FAILED,
    });
    expectNoStoreCacheControl(response);

    // 3) 失敗時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("Zod で検証: 壊れた JSON は VALIDATION_FAILED で拒否し、Set-Cookie を返さない", async () => {
    // 1) 不正な JSON 文字列を送る
    const response = await fetch(sessionUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: sessionUrl }),
        "content-type": "application/json",
      },
      body: "{",
    });

    // 2) validation 失敗で落ちること
    await expectApiErrJsonResponse(response, {
      status: 400,
      errorCode: errorCode.VALIDATION_FAILED,
    });
    expectNoStoreCacheControl(response);

    // 3) 失敗時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("Zod で検証: idToken が空白のみなら VALIDATION_FAILED で拒否し、Set-Cookie を返さない", async () => {
    // 1) idToken を空白だけで送る
    const response = await fetch(sessionUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: sessionUrl }),
        "content-type": "application/json",
      },
      body: JSON.stringify({ idToken: "   " }),
    });

    // 2) validation 失敗で落ちること
    await expectApiErrJsonResponse(response, {
      status: 400,
      errorCode: errorCode.VALIDATION_FAILED,
    });
    expectNoStoreCacheControl(response);

    // 3) 失敗時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("Zod で検証: 余計なフィールドがある JSON は VALIDATION_FAILED で拒否し、Set-Cookie を返さない", async () => {
    // 1) strictObject に違反する body を送る
    const response = await fetch(sessionUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: sessionUrl }),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        idToken: "dummy-id-token",
        unexpectedField: true,
      }),
    });

    // 2) validation 失敗で落ちること
    await expectApiErrJsonResponse(response, {
      status: 400,
      errorCode: errorCode.VALIDATION_FAILED,
    });
    expectNoStoreCacheControl(response);

    // 3) 失敗時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("session: 失敗（idToken不正）で Set-Cookie が出ない", async () => {
    // 1) HTTP境界で session を発行する
    // - 「idTokenだけ不正」を作るため、ヘルパーに idToken を上書きさせる
    const response = await issueSessionOverHttp({
      idToken: "invalid-id-token",
      cookieFetch: testClient.cookieFetch,
    });
    expectNoStoreCacheControl(response);

    // 4xx/5xx が契約（Emulator 状態で 503 になる場合がある）
    expect(response.status).toBeGreaterThanOrEqual(400);
    await expectApiErrJsonResponse(response, { status: response.status });

    // 2)Response から Set-Cookie を取得する
    // - 失敗するはずなので Set-Cookie は出ないはず
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBe(0);
  });

  it("session: 失敗（未確認メール idToken）では 403 ACCESS_DENIED で拒否し、Set-Cookie が出ない", async () => {
    // 1) 未確認メールの idToken を用意する
    const unverifiedEmailIdToken = await createTestUserAndFetchIdToken();

    // 2) HTTP境界で session を発行する（idToken だけ差し替える）
    const response = await issueSessionOverHttp({
      idToken: unverifiedEmailIdToken,
      cookieFetch: testClient.cookieFetch,
    });
    expectNoStoreCacheControl(response);

    // 3) ポリシー違反として 403 ACCESS_DENIED になること
    await expectApiErrJsonResponse(response, {
      status: 403,
      errorCode: errorCode.ACCESS_DENIED,
    });

    // 4) 拒否時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBe(0);
  });

  it("session: 成功で Set-Cookie（HttpOnly/Secure/SameSite/Max-Age/Path）", async () => {
    // 1) セッション発行を HTTP境界で実行
    const response = await issueSessionOverHttp({
      cookieFetch: testClient.cookieFetch,
    });
    expectNoStoreCacheControl(response);

    await expectApiOkJsonResponse(response, { issued: true });

    // 2) Set-Cookie が出る + 属性が揃う
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBeGreaterThan(0);

    assertSessionCookieAttributes(setCookies);
  });
});

describe("DELETE /api/auth/session (統合 / HTTP境界)", () => {
  beforeEach(() => {
    testClient = createHttpTestClient();
  });

  it("unsafe method 防御: cross-site は ACCESS_DENIED で拒否し、Set-Cookie を返さない", async () => {
    // 1) cross-site を明示した unsafe method を送る
    const response = await fetch(sessionUrl, {
      method: "DELETE",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: sessionUrl }),
        "Sec-Fetch-Site": "cross-site",
      },
    });

    // 2) guard で拒否されること
    await expectApiErrJsonResponse(response, {
      status: 403,
      errorCode: errorCode.ACCESS_DENIED,
    });
    expectNoStoreCacheControl(response);

    // 3) 拒否時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("unsafe method 防御: Origin/Referer 不一致は ACCESS_DENIED で拒否し、Set-Cookie を返さない", async () => {
    // 1) Origin/Referer 不一致を送る
    // - Sec-Fetch-Site を外し、Origin/Referer フォールバック分岐を通す
    const response = await fetch(sessionUrl, {
      method: "DELETE",
      redirect: "manual",
      headers: {
        Origin: "https://evil.example.com",
        Referer: "https://evil.example.com/attack",
      },
    });

    // 2) guard で拒否されること
    await expectApiErrJsonResponse(response, {
      status: 403,
      errorCode: errorCode.ACCESS_DENIED,
    });
    expectNoStoreCacheControl(response);

    // 3) 拒否時は Set-Cookie を返さないこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("logout: 成功で削除Set-Cookie を返し、以後 /api/users/me は AUTH_REQUIRED になる", async () => {
    // 1) 事前にサインイン状態を作る
    // - CookieJar に SESSION_COOKIE_NAME が入ることを前提にする
    const issueResponse = await issueSessionOverHttp({
      cookieFetch: testClient.cookieFetch,
    });
    if (!issueResponse.ok) {
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary: "前提の session 発行が失敗しました。",
        expected: "HTTP 2xx",
        observed: `status=${issueResponse.status}`,
        nextActions: [
          "Auth Emulator が起動しているか確認する",
          "Next.js側に FIREBASE_AUTH_EMULATOR_HOST が渡っているか確認する",
        ],
      });
    }

    // 2) サインイン状態で /api/users/me が 200 になることを確認する
    // - ここが崩れると logout の成否以前に前提が崩れている
    const meUrl = resolveTestUrl(USER_PATHS.me);
    const meBefore = await testClient.cookieFetch(meUrl, {
      method: "GET",
      redirect: "manual",
    });
    if (!meBefore.ok) {
      const body = await meBefore.text().catch(() => "");
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary:
          "logout 前提として /api/users/me がサインイン成功する必要があります。",
        expected: "HTTP 2xx",
        observed: `status=${meBefore.status} body=${body.slice(0, 200)}`,
        nextActions: [
          "/api/users/me が SESSION_COOKIE_NAME を検証できているか確認する",
          "SESSION_COOKIE_NAME の属性が意図通りか確認する",
        ],
      });
    }

    // 3) 通常サインアウトを実行する
    // - ここでは revoke は扱わず、Cookie削除のみを検証する
    const logoutResponse = await deleteSessionOverHttp({
      cookieFetch: testClient.cookieFetch,
    });
    expectNoStoreCacheControl(logoutResponse);

    // 4) 成功レスポンス契約を確認する
    await expectApiOkJsonResponse(logoutResponse, { cleared: true });

    // 5) 削除 Set-Cookie を返すこと
    // - ブラウザが Cookie を削除するには Set-Cookie が必要
    const setCookies = getSetCookiesFromFetchResponse(logoutResponse);
    expect(setCookies.length).toBeGreaterThan(0);

    // 6) Set-Cookie の削除属性を検査する
    // - Max-Age=0 が入っていることが最重要
    assertSessionCookieDeletionAttributes(setCookies);

    // 7) CookieJar から SESSION_COOKIE_NAME が消えたことを検査する
    // - Jar が消えていないと /api/users/me が SESSION_COOKIE_NAME 無し にならず、テストが不安定になる
    const sessionCookieAfterLogout = await getCookieValueFromJar(
      {
        url: meUrl,
        cookieName: SESSION_COOKIE_NAME,
      },
      testClient.cookieJar,
    );
    if (sessionCookieAfterLogout) {
      const cookiesAfterLogout = await getCookiesForJar(
        meUrl,
        testClient.cookieJar,
      );
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary:
          "logout 後は CookieJar から SESSION_COOKIE_NAME が消えるべきです。",
        expected: `CookieJar に ${SESSION_COOKIE_NAME} が存在しない`,
        observed: `cookies=${JSON.stringify(cookiesAfterLogout)}`,
        nextActions: [
          "削除Set-Cookie の Path や Secure が発行時と一致しているか確認する",
          "Cookie名が一致しているか確認する",
        ],
      });
    }

    // 8) logout 後の /api/users/me は AUTH_REQUIRED になること
    // - SESSION_COOKIE_NAME が送られない状態を検査する
    const meAfter = await testClient.cookieFetch(meUrl, {
      method: "GET",
      redirect: "manual",
    });
    await expectApiErrJsonResponse(meAfter, {
      status: 401,
      errorCode: errorCode.AUTH_REQUIRED,
    });
  });

  it("logout: 未サインイン（SESSION_COOKIE_NAME 無し）でも成功し、削除Set-Cookie を返す", async () => {
    // 1) 未サインイン状態で logout を叩く
    // - 期待: 冪等に成功する（状態ズレに強い）
    const logoutResponse = await deleteSessionOverHttp({
      cookieFetch: testClient.cookieFetch,
    });
    expectNoStoreCacheControl(logoutResponse);

    // 2) 成功レスポンス契約を確認する
    await expectApiOkJsonResponse(logoutResponse, { cleared: true });

    // 3) 削除 Set-Cookie を返すこと
    // - SESSION_COOKIE_NAME 無しでも常に返しておくと、ブラウザ側の残骸掃除に強い
    const setCookies = getSetCookiesFromFetchResponse(logoutResponse);
    expect(setCookies.length).toBeGreaterThan(0);

    // 4) 削除属性を検査する
    assertSessionCookieDeletionAttributes(setCookies);

    // 5) CookieJar に SESSION_COOKIE_NAME が入っていないことを念のため確認する
    const meUrl = resolveTestUrl(USER_PATHS.me);
    const sessionCookieAfterLogout = await getCookieValueFromJar(
      {
        url: meUrl,
        cookieName: SESSION_COOKIE_NAME,
      },
      testClient.cookieJar,
    );
    if (sessionCookieAfterLogout) {
      const cookiesAfter = await getCookiesForJar(meUrl, testClient.cookieJar);
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary:
          "未サインイン logout 後に SESSION_COOKIE_NAME が存在してはいけません。",
        expected: `CookieJar に ${SESSION_COOKIE_NAME} が存在しない`,
        observed: `cookies=${JSON.stringify(cookiesAfter)}`,
      });
    }
  });
});
