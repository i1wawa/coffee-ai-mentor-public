// apps/web/src/tests/e2e/auth/auth-sign-out-flow.spec.ts
// ========================================================
// 概要:
// - サインアウトE2E（認証済み）
//
// 契約:
// - When: 認証済みで /app を開く
//   Then: ユーザーメニュートリガーが表示される
//
// - When: サインアウトを実行する
//   Then: サインアウト操作が完了する
//   And: /sign-in に遷移する（app variant: redirectTo="/sign-in/"）
//
// - When: サインアウト後に /app へ直アクセスする
//   Then: /sign-in に誘導される（セッションCookieなし）
// ========================================================

import {
  buildTestFailureMessage,
  createTestFailureError,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import { expect, test } from "../fixtures";
import { createAppPage } from "../pom/app.pom";
import { createSignInPage } from "../pom/sign-in.pom";

// -----------------------------------------------------------------------
// テスト本体
// -----------------------------------------------------------------------

test.describe("auth sign out flow (user)", () => {
  test("認証済みでサインアウト → /sign-inへ遷移 → /app は /sign-in へ", async ({
    page,
  }) => {
    // 1) /app に到達する
    try {
      await page.goto("/app", { waitUntil: "domcontentloaded" });
    } catch (e) {
      const cause = e instanceof Error ? e : new Error(String(e));
      const error = createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary: "認証済みユーザーの /app 直アクセスが失敗しました。",
        expected: "/app に到達できる",
        observed: `page.goto が失敗: ${cause.message}`,
        nextActions: [
          "storageState（user.json）が生成されているか確認する",
          "/api/auth/session が Set-Cookie を返せているか確認する",
        ],
      });
      (error as Error & { cause?: unknown }).cause = cause;
      throw error;
    }

    // 2) アプリ画面が表示される（契約点）
    const appPage = createAppPage(page);
    await appPage.expectVisible();

    // 3) ユーザーメニューのトリガーが表示される
    const userMenuTrigger = page.getByRole("button", {
      name: "ユーザーメニュー",
    });
    await expect(
      userMenuTrigger,
      buildTestFailureMessage({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary: "認証済みならユーザーメニューのトリガーが表示されるべきです。",
        expected: 'role="button" かつ name="ユーザーメニュー" が表示される',
        observed: 'role="button" かつ name="ユーザーメニュー" が見つからない',
        nextActions: [
          "HeaderAuthControls の認証判定が isAuthenticated を見ているか確認する",
          "メニュートリガーにスクリーンリーダー向けの名前があるか確認する",
        ],
      }),
    ).toBeVisible();

    // 4) メニューを開いてサインアウトをクリックする
    await userMenuTrigger.click();
    const signOutMenuItem = page.getByRole("menuitem", {
      name: "サインアウト",
    });
    await expect(signOutMenuItem).toBeVisible();
    await signOutMenuItem.click();

    // 5) app variant は redirectTo="/sign-in/" を指定しているため /sign-in に遷移する
    await expect(
      page,
      buildTestFailureMessage({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary: "サインアウト後は /sign-in に遷移するべきです。",
        expected: "URL が /sign-in になる",
        observed: `現在のURL=${page.url()}`,
        nextActions: [
          "SessionUserMenu の signOut.redirectTo が '/sign-in/' になっているか確認する",
          "router.push が呼べているか確認する",
        ],
      }),
    ).toHaveURL(/\/sign-in(?:[?#]|$)/);

    // 6) サインアウト後に /app へ直アクセスすると /sign-in に落ちる
    // - ここは機能契約の検証なので、Playwright標準エラーで十分に原因を追える
    await page.goto("/app", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/sign-in(?:[/?#]|$)/);

    // 7) サインイン画面が表示される（契約点）
    const signInPage = createSignInPage(page);
    await signInPage.expectVisible();
  });
});
