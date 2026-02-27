// apps/web/src/app/api/auth/session/revoke/route.integration.test.ts
// ========================================================
// 概要:
// - 統合（HTTP境界）テスト: POST /api/auth/session/revoke
//
// 代表シナリオ（POST）:
// - cookie 無し: 未サインインでも no-op 成功（200 + ok/revoked=true）+ 削除 Set-Cookie
// - unsafe method 防御: cross-site は 403(ACCESS_DENIED) + Set-Cookie なし
// - unsafe method 防御: Origin/Referer 不一致は 403(ACCESS_DENIED) + Set-Cookie なし
// - 異常に長い cookie: no-op 成功（200 + ok/revoked=true）+ 削除 Set-Cookie
// - cookie 不正値: no-op 成功（200 + ok/revoked=true）+ 削除 Set-Cookie
// - 成功: 200 + ok/revoked=true + 削除 Set-Cookie（CookieJar からも消える）
//
// 前提:
// - 事前に POST /api/auth/session が成功し、/api/users/me が 200 になる
//
// 非目的:
// - revoke によって盗難コピーが無効化されることの実証
//   - これは Auth Emulator の挙動差や /api/users/me の実装（失効検知）に依存しやすい
//   - ここでは端末側 Cookie の削除を HTTP 境界の契約として固定する
//
// 注意:
// - 2026/01時点では、Auth Emulator では revokeRefreshTokens が反映されない（検証済み）
// - 全契約の一覧は contracts/src/auth/auth-session-revoke.http.md を参照する
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
import { MAX_SESSION_COOKIE_CHARS } from "@/backend/shared/http/request.guard.server";
import {
  assertSessionCookieAttributes,
  assertSessionCookieDeletionAttributes,
} from "@/tests/utils/session-cookie-assertions";
import { buildUnsafeMethodSameOriginHeadersForFetch } from "@/tests/vitest-utils/integration/utils/auth-requests-for-fetch";
import {
  issueSessionOverHttp,
  revokeSessionsOverHttp,
} from "@/tests/vitest-utils/integration/utils/auth-session";
import {
  getCookiesForJar,
  getCookieValueFromJar,
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

const revokeUrl = resolveTestUrl(AUTH_PATHS.revoke);
let testClient: HttpTestClient;

describe("POST /api/auth/session/revoke (統合 / HTTP境界)", () => {
  beforeEach(() => {
    testClient = createHttpTestClient();
  });

  it("unsafe method 防御: cross-site は ACCESS_DENIED で拒否し、削除 Set-Cookie を返さない", async () => {
    // 1) cross-site を明示した unsafe method を送る
    const response = await fetch(revokeUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: revokeUrl }),
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
    // - guard 未通過なので端末側 cookie 掃除は行わない契約
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies).toHaveLength(0);
  });

  it("unsafe method 防御: Origin/Referer が不一致なら ACCESS_DENIED で拒否し、削除 Set-Cookie を返さない", async () => {
    // 1) Origin/Referer 不一致を送る
    // - Sec-Fetch-Site をあえて外し、Origin/Referer フォールバック分岐を通す
    const response = await fetch(revokeUrl, {
      method: "POST",
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

  it("異常に長い cookie 防御: 異常に長い cookie でも no-op 成功し、削除 Set-Cookie を返す", async () => {
    // 1) 異常に長い cookie を Cookie ヘッダで直送する
    // - CookieJar は巨大cookieを保持できないことがあるため
    const tooLongCookieValue = "a".repeat(MAX_SESSION_COOKIE_CHARS + 1);
    const response = await fetch(revokeUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: revokeUrl }),
        Cookie: `${SESSION_COOKIE_NAME}=${tooLongCookieValue}`,
      },
    });

    // 2) no-op 成功 + no-store を返すこと
    await expectApiOkJsonResponse(response, { revoked: true });
    expectNoStoreCacheControl(response);

    // 3) 削除 Set-Cookie を返すこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(setCookies);
  });

  it("cookie 無し: 未サインイン状態でも no-op 成功（冪等）で削除 Set-Cookie を返す", async () => {
    // 1) revoke を実行する（未サインイン）
    const revokeResponse = await revokeSessionsOverHttp({
      cookieFetch: testClient.cookieFetch,
    });
    await expectApiOkJsonResponse(revokeResponse, { revoked: true });
    expectNoStoreCacheControl(revokeResponse);

    // 2) 削除 Set-Cookie を返すこと
    // - 未サインインでも cookie 掃除の契約を維持する
    const revokeSetCookies = getSetCookiesFromFetchResponse(revokeResponse);
    expect(revokeSetCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(revokeSetCookies);
  });

  it("未認証系エラー: 無効 cookie（AUTH_INVALID相当）でも no-op 成功し、削除 Set-Cookie を返す", async () => {
    // 1) 明らかに不正な session cookie を直送する
    const response = await fetch(revokeUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        ...buildUnsafeMethodSameOriginHeadersForFetch({ url: revokeUrl }),
        Cookie: `${SESSION_COOKIE_NAME}=invalid-session-cookie`,
      },
    });

    // 2) no-op 成功 + no-store を返すこと
    await expectApiOkJsonResponse(response, { revoked: true });
    expectNoStoreCacheControl(response);

    // 3) 削除 Set-Cookie を返すこと
    const setCookies = getSetCookiesFromFetchResponse(response);
    expect(setCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(setCookies);
  });

  it("成功: 削除 Set-Cookie を返す（端末側 cookie を掃除する）", async () => {
    // 1) サインイン状態を作る
    // - CookieJar に session cookie が入る
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

    // 2) session 発行時の Set-Cookie 属性を最低限検査する
    // - セキュリティサインアウトの前提として cookie 属性が成立している必要がある
    const issuedSetCookies = getSetCookiesFromFetchResponse(issueResponse);
    expect(issuedSetCookies.length).toBeGreaterThan(0);
    assertSessionCookieAttributes(issuedSetCookies);

    // 3) /api/users/me がサインイン成功することを確認する
    // - ここが崩れると revoke の検証以前に前提が崩れている
    const meUrl = resolveTestUrl(USER_PATHS.me);
    const meBefore = await testClient.cookieFetch(meUrl, {
      method: "GET",
      redirect: "manual",
    });
    if (!meBefore.ok) {
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary: "前提として /api/users/me が 200 になる必要があります。",
        expected: "HTTP 2xx",
        observed: `status=${meBefore.status}`,
        nextActions: [
          "/api/users/me が session cookie を検証できているか確認する",
          "verifySessionCookie の例外が mapper で潰れていないか確認する",
        ],
      });
    }

    // 4) セキュリティ用サインアウト（全端末サインアウト / 盗難疑い）を実行する
    const revokeResponse = await revokeSessionsOverHttp({
      cookieFetch: testClient.cookieFetch,
    });
    await expectApiOkJsonResponse(revokeResponse, { revoked: true });
    expectNoStoreCacheControl(revokeResponse);

    // 5) 削除 Set-Cookie を返すこと
    // - ローカル端末の cookie を消す責務
    const revokeSetCookies = getSetCookiesFromFetchResponse(revokeResponse);
    expect(revokeSetCookies.length).toBeGreaterThan(0);
    assertSessionCookieDeletionAttributes(revokeSetCookies);

    // 6) CookieJar から session cookie が消えること
    // - 削除 Set-Cookie が返っても Jar が消えないと、以後のテストが不安定になる
    const sessionCookieAfterRevoke = await getCookieValueFromJar(
      {
        url: meUrl,
        cookieName: SESSION_COOKIE_NAME,
      },
      testClient.cookieJar,
    );
    if (sessionCookieAfterRevoke) {
      const cookiesAfter = await getCookiesForJar(meUrl, testClient.cookieJar);
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary: "revoke 後は CookieJar から session cookie が消えるべきです。",
        expected: `CookieJar に ${SESSION_COOKIE_NAME} が存在しない`,
        observed: `cookies=${JSON.stringify(cookiesAfter)}`,
        nextActions: [
          "削除 Set-Cookie の Path や Secure が発行時と一致しているか確認する",
          "deleteSessionCookie が呼ばれているか確認する",
        ],
      });
    }
  });

  it.skip("security logout: 盗難コピー（Cookieヘッダ直送）でも /api/users/me が 401 になる", async () => {
    // このテストで本来やりたいこと
    // - revoke（全端末サインアウト）後に、盗まれた session cookie でも /api/users/me が 401 になることを保証する
    //
    // できない理由
    // - 2026/01時点では、Auth Emulator では revokeRefreshTokens が反映されない（検証済み）
    // - そのため、Emulator 環境では revoke 後も /api/users/me が 401 にならず、テストが不安定になる
    //
    // 代替方針
    // - 本ファイルでは端末側 cookie の削除（Set-Cookie と CookieJar）だけを契約として固定する
    // - 盗難コピー無効化の実証は、本番相当環境での別テストに分離する
  });
});
