// apps/web/src/tests/e2e/pom/account-settings.pom.ts
// ========================================================
// 概要:
// - E2E: アカウント設定画面の Page Object Model（POM）
//
// 契約:
// - 画面のルート要素は data-testid="account-settings-page" を持つ
// - 削除導線は role/name/placeholder で安定参照できる
// ========================================================

import {
  buildTestFailureMessage,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import type { Page } from "@playwright/test";
import { expect as baseExpect } from "../fixtures";

const CONFIRM_TEXT = "DELETE";

export function createAccountSettingsPage(page: Page) {
  const root = page.getByTestId("account-settings-page");
  const deleteOpenButton = page.getByRole("button", {
    name: "アカウントを削除",
  });
  const deleteDialog = page.getByRole("alertdialog", {
    name: "アカウントを削除します",
  });
  const deleteConfirmInput = page.getByPlaceholder("DELETE");
  const deleteSubmitButton = deleteDialog.getByRole("button", {
    name: "アカウントを削除",
  });
  const deleteCompletedDialog = page.getByRole("alertdialog", {
    name: "アカウントを削除しました",
  });
  const deleteCompletedButton = page.getByRole("button", {
    name: "サインイン画面へ",
  });

  return {
    expectVisible: async () => {
      await baseExpect(
        root,
        buildTestFailureMessage({
          reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
          summary: "アカウント設定画面の契約点が満たされていません。",
          expected: 'data-testid="account-settings-page" が表示される',
          observed: "account-settings-page が見つからない、または非表示",
          nextActions: [
            '/app/settings/account のルート要素に data-testid="account-settings-page" を付与する',
          ],
        }),
      ).toBeVisible();
    },

    openDeleteDialog: async () => {
      await baseExpect(
        deleteOpenButton,
        buildTestFailureMessage({
          reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
          summary: "アカウント削除ボタンが表示されるべきです。",
          expected: 'role="button" かつ name="アカウントを削除" が表示される',
          observed:
            'role="button" かつ name="アカウントを削除" が見つからない、または非表示',
          nextActions: [
            "Danger Zone にアカウント削除ボタンが表示されるか確認する",
          ],
        }),
      ).toBeVisible();
      await deleteOpenButton.click();
    },

    expectDeleteDialogVisible: async () => {
      await baseExpect(
        deleteDialog,
        buildTestFailureMessage({
          reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
          summary: "アカウント削除ダイアログが表示されるべきです。",
          expected:
            'role="alertdialog" かつ name="アカウントを削除します" が表示される',
          observed:
            'role="alertdialog" かつ name="アカウントを削除します" が見つからない、または非表示',
          nextActions: ["アカウント削除ボタン押下でダイアログが開くか確認する"],
        }),
      ).toBeVisible();
    },

    inputDeleteConfirmText: async () => {
      await deleteConfirmInput.fill(CONFIRM_TEXT);
    },

    submitDelete: async () => {
      await baseExpect(deleteSubmitButton).toBeEnabled();
      await deleteSubmitButton.click();
    },

    expectDeleteCompleted: async () => {
      await baseExpect(
        deleteCompletedDialog,
        buildTestFailureMessage({
          reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
          summary: "削除完了後の遷移ボタンが表示されるべきです。",
          expected: 'role="button" かつ name="サインイン画面へ" が表示される',
          observed:
            'role="button" かつ name="サインイン画面へ" が見つからない、または非表示',
          nextActions: ["削除成功時の完了ダイアログ表示を確認する"],
        }),
      ).toBeVisible();
      await baseExpect(deleteCompletedButton).toBeVisible();
    },

    completeAndRedirectToSignIn: async () => {
      await deleteCompletedButton.click();
    },
  };
}
