// apps/web/src/tests/e2e/auth/auth-session-flow.spec.ts
// ========================================================
// 概要:
// - 認証セッションフローE2E（認証済み）
// - 認証済み storageState を注入した状態で、/app 到達・維持・誘導が成立することを確認する
//
// 契約:
// - When: 認証済みユーザーが /app に直アクセスする
//   Then: URL が /app のまま（/sign-in にリダイレクトされない）
//   And: アプリ画面が表示される（契約点）
//
// - When: /app 上でリロードする
//   Then: URL が /app のまま（認証状態が維持される）
//
// - When: 認証済みで /sign-in にアクセスする
//   Then: /app に誘導される
// ========================================================

import {
  buildTestFailureMessage,
  createTestFailureError,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import { expect, test } from "../fixtures";
import { createAppPage } from "../pom/app.pom";

// ---------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------

test.describe("auth session flow (user)", () => {
  test("認証済みで/app到達 → リロード後も維持 → /sign-inは/appへ誘導", async ({
    page,
  }) => {
    // 1) When: 認証済みユーザーが /app に直アクセスする
    // - goto 自体が失敗した場合も原因追跡できる形で落とす
    try {
      await page.goto("/app", { waitUntil: "domcontentloaded" });
    } catch (e) {
      const cause = e instanceof Error ? e : new Error(String(e));
      const error = createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary: "認証済みユーザーの /app 直アクセスが失敗しました。",
        expected: "/app に到達できる（ネットワークエラーやループが起きない）",
        observed: `page.goto が失敗: ${cause.message}`,
        nextActions: [
          "storageState（user.json）が生成されているか確認する",
          "/api/auth/session が Set-Cookie を返せているか確認する",
          "HTTPS自己署名対策（ignoreHTTPSErrors）が設定されているか確認する",
        ],
      });
      (error as Error & { cause?: unknown }).cause = cause;
      throw error;
    }

    // 1-Then) /app に到達できる
    await expect(
      page,
      buildTestFailureMessage({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary: "認証済みのはずなのに/appに到達できません。",
        expected: "URLが /app になる（/sign-in にリダイレクトされない）",
        observed: `現在のURL=${page.url()}`,
        nextActions: [
          "setupが storageState（cookie）を正しく保存できているか確認する",
          "/api/auth/session が cookie を発行できているか確認する",
        ],
      }),
      // リロード先のURLがアプリホーム画面
    ).toHaveURL(/\/app(?:[/?#]|$)/);

    // アプリホーム画面が表示される
    const appPage = createAppPage(page);
    await appPage.expectVisible();

    // 2) When: 認証済みユーザーが保護ページ（アプリホーム画面）でリロードする
    await page.reload({ waitUntil: "domcontentloaded" });

    // 2-Then) /app のまま
    await expect(
      page,
      buildTestFailureMessage({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary: "リロード後に認証状態が維持されるべきです。",
        expected: "URLが /app のまま",
        observed: `現在のURL=${page.url()}`,
        nextActions: [
          "cookie属性（Secure/SameSite/Path/Max-Age）が正しいか確認する",
          "サーバ側のセッション検証（/api/users/me 等）が失敗していないか確認する",
        ],
      }),
      // サインイン画面にリダイレクトしない（session cookieが有効）
    ).toHaveURL(/\/app(?:[/?#]|$)/);

    // 3) When: 認証済みユーザーが /sign-in を開く
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

    // 3-Then) /app に誘導される
    await expect(
      page,
      buildTestFailureMessage({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary: "認証済みで/sign-inを開くと/appに誘導されるべきです。",
        expected: "URLが /app になる",
        observed: `現在のURL=${page.url()}`,
        nextActions: [
          "sign-inページのガード条件（認証済み→/app）を確認する",
          "middleware/layoutの分岐条件を確認する",
        ],
      }),
      // /app にリダイレクトされる
    ).toHaveURL(/\/app(?:[/?#]|$)/);
  });
});
