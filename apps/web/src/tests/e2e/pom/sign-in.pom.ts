// apps/web/src/tests/e2e/pom/sign-in.pom.ts
// ========================================================
// 概要:
// - E2E: サインイン画面の Page Object Model（POM）
//
// 契約:
// - 画面のルート要素は data-testid="sign-in-page" を持つ
// ========================================================

import {
  buildTestFailureMessage,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import type { Page } from "@playwright/test";
import { expect as baseExpect } from "../fixtures";

/**
 * サインイン画面のPage Object Model（POM）を生成する。
 * - 目的：locators/成立条件を1箇所に集約し、UI変更時の修正点を局所化する
 * - 契約：data-testid="sign-in-page"
 */
export function createSignInPage(page: Page) {
  // サインイン画面の契約点（ルート要素）をlocatorとして保持する。
  // - テストはこの契約点でサインイン画面であることを判定する。
  const root = page.getByTestId("sign-in-page");

  return {
    // サインイン画面が表示されていることを検証
    expectVisible: async () => {
      await baseExpect(
        root,
        buildTestFailureMessage({
          reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
          summary:
            "サインイン画面の成立条件（test id契約）が満たされていません。",
          expected:
            'サインイン画面のルート要素に data-testid="sign-in-page" が付与され、表示されている',
          observed: "sign-in-page が見つからない、または非表示",
          nextActions: [
            'サインイン画面のルート要素に data-testid="sign-in-page" を付与する',
            "サインイン画面がモーダル/レイアウト変更されたなら契約点を更新する",
          ],
        }),
      ).toBeVisible();
    },
  };
}
