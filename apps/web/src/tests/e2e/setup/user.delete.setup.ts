// apps/web/src/tests/e2e/setup/user.delete.setup.ts
// ================================================================
// 概要:
// - Playwright 用に「アカウント削除E2E専用の認証済み storageState」を生成して保存する。
// - 破壊的操作（アカウント削除）を通常の認証済みE2Eから分離する。
//
// 契約:
// - 出力: AUTH_DELETE_STATE_PATH に storageState を保存する。
// - 認証手段: Firebase Auth Emulator から取得した idToken を使う。
// - セッション発行: POST /api/auth/session に { idToken } を送る（csrf は使わない）。
//
// 前提:
// - Auth Emulator が利用可能で、テストユーザー（email/password）が作成できる。
// - playwright.config.ts で use.baseURL が設定されている。
// ===============================================================

import fs from "node:fs/promises";
import path from "node:path";
import {
  AUTH_PATHS,
  type AuthSessionIssueRequest,
} from "@contracts/src/auth/auth-contract";
import {
  createTestFailureError,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import { test as setup } from "@playwright/test";
import { createVerifiedTestUserAndFetchIdToken } from "@/tests/utils/auth-emulator";
import { AUTH_DELETE_STATE_PATH } from "../e2e-constants";
import { buildSessionIssueRequestForPlaywright } from "./session-request";

function deriveOriginFromBaseUrl(baseURL: string): string {
  const u = new URL(baseURL);
  return `${u.protocol}//${u.host}`;
}

setup(
  "setup: アカウント削除E2E専用storageStateを生成する",
  async ({ browser, baseURL }) => {
    if (!baseURL) {
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.ABORTED,
        summary: "E2EはbaseURL未設定のまま実行できません。",
        expected: "playwright.config.tsのuse.baseURLが設定されている",
        observed: "baseURLがundefined",
        nextActions: ["playwright.config.tsのuse.baseURLを設定する"],
      });
    }

    const idToken = await createVerifiedTestUserAndFetchIdToken();

    const context = await browser.newContext({
      baseURL,
      storageState: undefined,
      ignoreHTTPSErrors: true,
    });

    try {
      const page = await context.newPage();
      const origin = deriveOriginFromBaseUrl(baseURL);
      const requestBody: AuthSessionIssueRequest = { idToken };
      const sessionResponse = await page.request.post(
        AUTH_PATHS.session,
        buildSessionIssueRequestForPlaywright({ origin, requestBody }),
      );

      if (!sessionResponse.ok()) {
        throw createTestFailureError({
          reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
          summary: "session cookie発行（/api/auth/session）に失敗しました。",
          expected: "POST /api/auth/session が200系で Set-Cookie を返す",
          observed: `status=${sessionResponse.status()} body=${(await sessionResponse.text()).slice(0, 200)}`,
          nextActions: [
            "FIREBASE_AUTH_EMULATOR_HOST がNext.jsサーバに渡っているか確認する",
            "session発行処理がAdmin SDK（verifyIdToken/createSessionCookie等）を呼べているか確認する",
          ],
        });
      }

      await fs.mkdir(path.dirname(AUTH_DELETE_STATE_PATH), { recursive: true });
      await context.storageState({ path: AUTH_DELETE_STATE_PATH });
    } finally {
      await context.close();
    }
  },
);
