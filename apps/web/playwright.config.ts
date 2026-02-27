// apps/web/playwright.config.ts
// =================================================================
// 概要:
// - E2Eテスト基盤（Playwright）の共通設定を集約する
//
// 責務:
// - テスト探索と成果物（trace/screenshot/video/report）の出力先を固定する
// - 実行条件（並列/リトライ/CI制御）を一貫させる
// - 認証状態ごとのプロジェクト（setup/anonymous/user/user:delete）を定義する
// - テスト対象のNext.jsサーバ起動方法を環境（CI/ローカル）で切り替える
//
// 前提:
// - baseURL はローカルHTTPS（自己署名証明書）で動作する
// - Playwright 実行時は Next.js の自動 env ロードに依存せず、.env.local を明示ロードする
// - trace / screenshot / video / HTML report の保存先は PLAYWRIGHT_ARTIFACTS_DIR 配下に集約し、共有範囲を限定する
//
// 観測:
// - HTML report と test-results を出力し、失敗時の再現と原因追跡を容易にする
// - trace は「最初のリトライ時のみ」収集し、情報量と実行コストのバランスを取る
// ================================================================

import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import {
  AUTH_DELETE_STATE_PATH,
  AUTH_STATE_PATH,
  PLAYWRIGHT_ARTIFACTS_DIR,
} from "@/tests/e2e/e2e-constants";
import { TEST_BASE_URL } from "@/tests/utils/test-config";

// Playwright 実行時は Next.js の自動ロードに依存せず、明示的に env ファイルを読み込む
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

// CI環境判定
const isCI = !!process.env.CI;

export default defineConfig({
  // ------------------------------------------------------------------
  // パス設定
  // ------------------------------------------------------------------

  // この設定ファイルからの相対パスで、"tests"ディレクトリ内のテストファイルを検索
  testDir: "src/tests",
  // テスト成果物（trace/screenshot/video等）の出力先
  outputDir: path.join(PLAYWRIGHT_ARTIFACTS_DIR, "test-results"),
  // HTMLレポートの出力先
  reporter: [
    ["html", { outputFolder: path.join(PLAYWRIGHT_ARTIFACTS_DIR, "report") }],
  ],

  // ------------------------------------------------------------------
  // テスト実行設定
  // ------------------------------------------------------------------

  // すべてのテストを並列実行（テストが状態共有してると不安定）
  fullyParallel: true,
  // ソースコードにtest.onlyが誤って残っていた場合、CIでのビルドを失敗させる
  forbidOnly: isCI,
  // CIでのみ2回再試行
  retries: isCI ? 2 : 0,
  // CIでのみ並列実行を無効化（CIでは安定性優先）
  workers: isCI ? 1 : undefined,
  use: {
    // actions like `await page.goto('/')`などで使用するベースURLを指定
    baseURL: TEST_BASE_URL,
    // 失敗したテストを再試行する際、最初のリトライ時のみトレースを収集
    trace: "on-first-retry",
    // ブラウザ側でHTTPSエラーを無視（自己署名証明書対策）
    ignoreHTTPSErrors: true,
  },

  // ------------------------------------------------------------------
  // プロジェクト設定
  // ------------------------------------------------------------------

  projects: [
    // セットアップ用プロジェクト
    // - 認証済み状態を作成して保存する
    // - 他のプロジェクトからは参照専用で使用する
    {
      name: "setup",
      use: {
        ...devices["Desktop Chrome"],
        // setup自体は未認証から始める
        storageState: undefined,
      },
      // 通常E2E向けセットアップのみ実行
      testMatch: /e2e\/setup\/user\.setup\.ts/,
    },

    // アカウント削除E2E専用のセットアッププロジェクト
    {
      name: "setup:delete",
      use: {
        ...devices["Desktop Chrome"],
        storageState: undefined,
      },
      // 破壊的操作専用セットアップのみ実行
      testMatch: /e2e\/setup\/user\.delete\.setup\.ts/,
    },

    // 未認証ユーザー用プロジェクト
    {
      name: "chromium:anonymous",
      use: {
        ...devices["Desktop Chrome"],
        // 未認証を保証する
        storageState: undefined,
      },
      // 未認証前提のテストだけ実行
      testMatch: [
        /e2e\/auth\/auth-guard\.spec\.ts/,
        /e2e\/auth\/auth-invalid-cookie\.spec\.ts/,
      ],
    },

    // 認証済みユーザー用プロジェクト
    {
      name: "chromium:user",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        // 認証済みを保証する
        storageState: AUTH_STATE_PATH,
      },
      // 認証済み前提のテストだけ実行
      testMatch: [
        /e2e\/auth\/auth-session-flow\.spec\.ts/,
        /e2e\/auth\/auth-sign-out-flow\.spec\.ts/,
      ],
    },

    // 認証済みユーザー（アカウント削除専用）
    {
      name: "chromium:user:delete",
      dependencies: ["setup:delete"],
      use: {
        ...devices["Desktop Chrome"],
        // 削除専用の認証状態を使う
        storageState: AUTH_DELETE_STATE_PATH,
      },
      // アカウント削除フローE2Eのみ実行
      testMatch: [/e2e\/auth\/auth-account-delete-flow\.spec\.ts/],
    },
  ],

  // ------------------------------------------------------------------
  // テストサーバー起動設定
  // ------------------------------------------------------------------

  // テストを開始する前に、環境に適したサーバーを起動（CIでのみビルド）
  webServer: {
    command: isCI
      ? `pnpm build:standalone && pnpm start:standalone`
      : `pnpm dev`,
    url: TEST_BASE_URL,
    reuseExistingServer: !isCI,
    // build + standalone 起動を含むため、CIでは待機時間を延長
    timeout: isCI ? 180_000 : 60_000,
    // Webサーバ側でHTTPSエラーを無視（自己署名証明書対策）
    ignoreHTTPSErrors: true,
  },
});
