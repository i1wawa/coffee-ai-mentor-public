// apps/web/src/tests/e2e/setup/user.setup.ts
// ================================================================
// 概要:
// - Playwright 用に「認証済み storageState」を生成して保存する。
// - Playwright の "chromium:user" project が参照する前提データを作る。
// - 外部 OAuth Popup（フレーク要因）をE2Eから排除する。
//
// 契約:
// - 出力: AUTH_STATE_PATH に storageState を保存する（以後のE2Eが参照）。
// - 認証手段: Firebase Auth Emulator から取得した idToken を使う。
// - セッション発行: POST /api/auth/session に { idToken } を送る（csrf は使わない）。
//
// 前提:
// - Auth Emulator が利用可能で、テストユーザー（email/password）が存在する。
// - Next.js サーバが Auth Emulator に接続できる設定になっている。
// - playwright.config.ts で use.baseURL が設定されている。
// - HTTPS自己署名環境では ignoreHTTPSErrors が必要。
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
import { AUTH_STATE_PATH } from "../e2e-constants";
import { buildSessionIssueRequestForPlaywright } from "./session-request";

/**
 * baseURL（例: https://127.0.0.1:3000）から Origin を作る。
 * - 目的: Origin/Referer検証のフォールバックを確実に通す
 */
function deriveOriginFromBaseUrl(baseURL: string): string {
  const u = new URL(baseURL);
  return `${u.protocol}//${u.host}`;
}

/**
 * setup: 認証済みstorageStateを生成して保存する
 * - Playwright推奨：認証状態（storageState）を作って使い回す
 */
setup("setup: 認証済みstorageStateを生成する", async ({ browser, baseURL }) => {
  if (!baseURL) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.ABORTED,
      summary: "E2EはbaseURL未設定のまま実行できません。",
      expected: "playwright.config.tsのuse.baseURLが設定されている",
      observed: "baseURLがundefined",
      nextActions: ["playwright.config.tsのuse.baseURLを設定する"],
    });
  }

  // 1) Auth EmulatorからID Tokenを取得（非対話）
  const idToken = await createVerifiedTestUserAndFetchIdToken();

  // 2) BrowserContext の Cookie jar に session cookie を入れるため context を使う
  const context = await browser.newContext({
    baseURL,
    storageState: undefined,
    // HTTPS自己署名対策
    ignoreHTTPSErrors: true,
  });

  try {
    const page = await context.newPage();

    // 3) /api/auth/session を叩いて session cookie を発行（csrf不要）
    // - unsafe method 防御（Fetch Metadata + Origin/Referer）を通すためヘッダを付与する
    // - ここでSet-Cookieされた結果が BrowserContext に入り、storageStateへ保存できる
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

    // 4) storageState保存（ディレクトリが無いと失敗するので作る）
    await fs.mkdir(path.dirname(AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: AUTH_STATE_PATH });
  } finally {
    // 5) 後始末
    await context.close();
  }
});
