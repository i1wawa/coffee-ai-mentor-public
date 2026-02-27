// apps/web/src/tests/e2e/pom/app.pom.ts
// ========================================================
// 概要:
// - E2E: アプリホーム画面の Page Object Model（POM）
//
// 契約:
// - 画面のルート要素は data-testid="app-page" を持ち、表示される
// ========================================================

import {
  buildTestFailureMessage,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import type { Page } from "@playwright/test";
import { expect as baseExpect } from "../fixtures";

/**
 * アプリ画面（/app）のPage Object Model（POM）を生成する。
 * - 目的：locators/成立条件を1箇所に集約し、UI変更時の修正点を局所化する
 * - 契約点：data-testid="app-page"
 */
export function createAppPage(page: Page) {
  const root = page.getByTestId("app-page");

  return {
    /**
     * /app 画面が表示されていることを検証する
     */
    expectVisible: async () => {
      await baseExpect(
        root,
        buildTestFailureMessage({
          reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
          summary: "/app画面の契約点が満たされていません。",
          expected: 'data-testid="app-page" が表示されている',
          observed: "app-page が見つからない、または非表示",
          nextActions: [
            '/app画面のルート要素に data-testid="app-page" を付与する',
            "画面構造を変更したなら契約点を更新する",
          ],
        }),
      ).toBeVisible();
    },
  };
}
