// apps/web/src/tests/e2e/fixtures.ts
// =================================================================
// 概要:
// - E2Eテスト用の Playwright fixture 拡張
// - 誤爆防止のため、テスト開始前に baseURL の許可ホスト（allowlist）検証を自動で通す
//
// 責務:
// - test を拡張して「自動で安全ゲートを通す」
//
// 前提:
// - playwright.config.ts の use.baseURL、または CLI で baseURL が与えられる
// =================================================================

import {
  createTestFailureError,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import {
  test as base,
  expect as baseExpect,
  type TestInfo,
} from "@playwright/test";
import { E2E_ALLOWED_HOSTS } from "./e2e-constants";

// インポート口の統一用＆将来の拡張用にexportしておく
export { baseExpect as expect };

// ----------------------------------------------------------------
// 安全ゲート（誤爆防止）
// - E2Eが意図せず本番等を叩く事故を防ぐため、許可ホスト（allowlist）を強制する
// ----------------------------------------------------------------

/**
 * baseURLが許可されているか検証し、問題なければURLオブジェクトを返す
 * - 目的：E2Eで未許可ホストへのアクセスをブロック
 * - throws {Error}
 *   - [実行停止] baseURL未設定 / 許可されていないホスト
 *   - [前提不成立] baseURLがURLとして不正
 */
function assertBaseUrlIsAllowed(
  baseUrl: string | undefined,
  testInfo: TestInfo,
): URL {
  // baseURLがない＝E2Eの前提が崩れているため、実行停止として落とす
  if (!baseUrl) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.ABORTED,
      summary: "E2EはbaseURLが未設定のまま実行できません。",
      expected: "playwright.config.tsのuse.baseURLが設定されている",
      observed: "baseURLがundefined",
      nextActions: [
        "playwright.config.tsにuse.baseURLを設定する",
        "またはCLIでbaseURLを指定する",
        `project=${testInfo.project.name}`,
      ],
    });
  }

  // baseURLは文字列なので、URLとして解析できるかを検証する。
  // - URLとして壊れている＝前提不成立として落とす
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch (cause) {
    const error = createTestFailureError({
      reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
      summary: "E2EはbaseURLがURLとして不正なため実行できません。",
      expected: "baseURLがURL形式である（例：https:/**example.com）",
      observed: `baseURL=${String(baseUrl)}`,
      nextActions: [
        "playwright.config.tsのuse.baseURLを修正する",
        `project=${testInfo.project.name}`,
      ],
    });
    (error as Error & { cause?: unknown }).cause = cause;
    throw error;
  }

  // allowlistに含まれるホストかを検証
  const allowedHosts = new Set(E2E_ALLOWED_HOSTS);
  // 許可ホストに含まれない場合は実行停止
  if (!allowedHosts.has(url.hostname)) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.ABORTED,
      summary:
        "E2Eは許可されていないホストに対して実行できません（誤爆防止）。",
      expected: "許可ホスト（E2E_ALLOWED_HOSTS）に含まれるhost",
      observed: `host=${url.hostname} / baseURL=${url.toString()}`,
      nextActions: [
        'E2E_ALLOWED_HOSTS="stg-xxxxx.run.app,coffee-ai-mentor.example.com"を設定する',
        "ローカル実行ならE2E_ALLOWED_HOSTS未設定のまま127.0.0.1を使う",
        `project=${testInfo.project.name}`,
      ],
    });
  }

  return url;
}

/**
 * test を拡張して「自動で安全ゲートを通す」
 * - 各テストの先頭で baseURL を検証する
 * - テストコード側が安全ゲートを意識しなくて済むようにする
 */
export const test = base.extend<{ _safetyGate: boolean }>({
  _safetyGate: [
    async ({ baseURL }, use, testInfo) => {
      assertBaseUrlIsAllowed(baseURL, testInfo);
      await use(true);
    },
    { auto: true },
  ],
});
