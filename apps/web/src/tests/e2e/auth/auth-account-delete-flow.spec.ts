// apps/web/src/tests/e2e/auth/auth-account-delete-flow.spec.ts
// ========================================================
// 概要:
// - アカウント削除E2E（認証済み）
//
// 契約:
// - When: 認証済みで /app/settings/account を開く
//   Then: アカウント削除ダイアログを開ける
//
// - When: DELETE 入力でアカウント削除を実行する
//   Then: /sign-in に遷移する
//
// - When: 削除後に /app へ直アクセスする
//   Then: /sign-in に誘導される（セッションCookieなし）
// ========================================================

import {
  buildTestFailureMessage,
  createTestFailureError,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import { expect, test } from "../fixtures";
import { createAccountSettingsPage } from "../pom/account-settings.pom";
import { createSignInPage } from "../pom/sign-in.pom";

test.describe("auth account delete flow (user:delete)", () => {
  test("認証済みで削除完了 → /sign-in 遷移 → /app は /sign-in へ", async ({
    page,
  }) => {
    // 1) /app/settings/account に到達する（前提/環境境界）
    try {
      await page.goto("/app/settings/account", {
        waitUntil: "domcontentloaded",
      });
    } catch (e) {
      const cause = e instanceof Error ? e : new Error(String(e));
      const error = createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary:
          "認証済みユーザーの /app/settings/account 直アクセスが失敗しました。",
        expected: "/app/settings/account に到達できる",
        observed: `page.goto が失敗: ${cause.message}`,
        nextActions: [
          "setup:delete が storageState を生成できているか確認する",
          "/api/auth/session が Set-Cookie を返せているか確認する",
        ],
      });
      (error as Error & { cause?: unknown }).cause = cause;
      throw error;
    }

    const accountSettingsPage = createAccountSettingsPage(page);
    await accountSettingsPage.expectVisible();

    // 2) 削除ダイアログを開いて削除する
    await accountSettingsPage.openDeleteDialog();
    await accountSettingsPage.expectDeleteDialogVisible();
    await accountSettingsPage.inputDeleteConfirmText();
    await accountSettingsPage.submitDelete();
    await accountSettingsPage.expectDeleteCompleted();
    await accountSettingsPage.completeAndRedirectToSignIn();

    // 3) /sign-in に遷移する
    await expect(
      page,
      buildTestFailureMessage({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary: "アカウント削除後は /sign-in に遷移するべきです。",
        expected: "URL が /sign-in になる",
        observed: `現在のURL=${page.url()}`,
        nextActions: [
          "AccountDeleteDialog の redirectTo が /sign-in になっているか確認する",
          "削除成功時の完了ボタン押下で router.replace が呼ばれるか確認する",
        ],
      }),
    ).toHaveURL(/\/sign-in(?:[?#]|$)/);

    const signInPage = createSignInPage(page);
    await signInPage.expectVisible();

    // 4) 削除後に /app へ直アクセスすると /sign-in に落ちる
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(
      page,
      buildTestFailureMessage({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary:
          "削除後に /app へ直アクセスすると /sign-in に誘導されるべきです。",
        expected: "URL が /sign-in になる",
        observed: `現在のURL=${page.url()}`,
        nextActions: [
          "DELETE /api/users/me 成功時に cookie が削除されているか確認する",
          "認証ガードが未認証ユーザーを /sign-in へ誘導しているか確認する",
        ],
      }),
    ).toHaveURL(/\/sign-in(?:[/?#]|$)/);
    await signInPage.expectVisible();
  });
});
