// apps/web/src/tests/e2e/auth/auth-guard.spec.ts
// ========================================================
// 概要:
// - 認証ガードE2E（未認証）
// - 未サインインで /app に直アクセスしたとき、/sign-in に誘導されることを確認する
//
// 契約:
// - When: 未認証ユーザーが /app に直アクセスする
//   Then: URL が /sign-in になる
//   And: サインイン画面が表示される（契約点）
// ========================================================

import {
  buildTestFailureMessage,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import { expect, test } from "../fixtures";
import { createSignInPage } from "../pom/sign-in.pom";

// ---------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------

test.describe("auth guard (anonymous)", () => {
  test("未サインインで/app直アクセス → /sign-inに誘導される", async ({
    page,
  }) => {
    // 1) When: 未認証ユーザーが保護ページ（アプリホーム画面）に直アクセスする
    // - ここで失敗する場合も、Playwright標準エラーの情報で原因追跡できる
    await page.goto("/app", { waitUntil: "domcontentloaded" });

    // 2) Then: /sign-in に誘導される
    // - URLだけでなく、実際に画面契約点が成立していることも見る
    await expect(
      page,
      buildTestFailureMessage({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary:
          "未サインインで/appに直アクセスすると/sign-inに誘導されるべきです。",
        expected: "URLが /sign-in になる",
        observed: `現在のURL=${page.url()}`,
        nextActions: [
          "認証ガード（layout等）のリダイレクト条件を確認する",
          "このテストが chromium:anonymous project で走っているか確認する",
        ],
      }),
      // リダイレクト先のURLが /sign-in
    ).toHaveURL(/\/sign-in(?:[/?#]|$)/);

    // 3) And: サインイン画面が表示される（契約点）
    const signInPage = createSignInPage(page);
    await signInPage.expectVisible();
  });
});
