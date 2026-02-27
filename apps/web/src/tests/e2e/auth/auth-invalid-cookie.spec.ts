// apps/web/src/tests/e2e/auth/auth-invalid-cookie.spec.ts
// ========================================================
// 認証ガードE2E（不正cookie）
//
// 概要:
// - 不正な session cookie がある状態で、未認証として扱われることを保証する。
//
// 契約:
// - When: 不正cookieありで /app に直アクセスする
//   Then: /sign-in に到達できる
//   And: /app と /sign-in の間でリダイレクトループしない
//
// - When: 不正cookieありで /sign-in にアクセスする
//   Then: URL が /sign-in のまま（/app に誘導されない）
//   And: サインイン画面が表示される（契約点）
// ========================================================

import {
  buildTestFailureMessage,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import { SESSION_COOKIE_NAME } from "@/backend/shared/http/cookies";
import { expect, test } from "../fixtures";
import { createSignInPage } from "../pom/sign-in.pom";

// ---------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------

test.describe("auth guard (invalid cookie)", () => {
  test("不正cookieありで/app → /sign-in に到達でき、ループしない", async ({
    page,
    baseURL,
  }) => {
    // 1) 不正cookieを注入する
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: "invalid-cookie-for-e2e",
        url: baseURL,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);

    // 2) /app にアクセスする
    // - ここで失敗する場合も、Playwright標準エラーの情報で原因追跡できる
    await page.goto("/app", { waitUntil: "domcontentloaded" });

    // 3) /sign-in にいる
    await expect(
      page,
      buildTestFailureMessage({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary:
          "不正cookieで/appに直アクセスすると/sign-inに誘導されるべきです。",
        expected: "URLが /sign-in になる",
        observed: `現在のURL=${page.url()}`,
        nextActions: [
          "/(app)/layout.tsx と /(auth)/layout.tsx のガード条件が矛盾していないか確認する",
          "不正cookieを認証済み扱いにしていないか確認する",
          "getSessionUserForUi が AUTH_INVALID を未認証扱いにできているか確認する",
        ],
      }),
    ).toHaveURL(/\/sign-in(?:[/?#]|$)/);

    // 4) サインイン画面が成立している
    const signInPage = createSignInPage(page);
    await signInPage.expectVisible();
  });

  test("不正cookieありで/sign-in → /app に誘導されない", async ({
    page,
    baseURL,
  }) => {
    // 1) 不正cookieを注入する
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: "invalid-cookie-for-e2e",
        url: baseURL,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);

    // 2) /sign-in にアクセスする
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

    // 3) URL が /sign-in のまま
    await expect(
      page,
      buildTestFailureMessage({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary:
          "不正cookieで/sign-inにアクセスしても/appへ誘導されるべきではありません。",
        expected: "URLが /sign-in のまま",
        observed: `現在のURL=${page.url()}`,
        nextActions: [
          "sign-inページのガード条件（未認証は許可）が崩れていないか確認する",
          "不正cookieを認証済み扱いにしていないか確認する",
        ],
      }),
    ).toHaveURL(/\/sign-in(?:[/?#]|$)/);

    // 4) サインイン画面が成立している
    const signInPage = createSignInPage(page);
    await signInPage.expectVisible();
  });
});
