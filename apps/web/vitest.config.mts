// apps/web/vitest.config.mts
// ========================================================
// 概要:
// - apps/web の Vitest 設定（unit / integration を 1ファイルで定義する）
//
// 責務:
// - Vite/Vitest のプラグイン・パス解決など実行基盤を揃える
// - テスト共通設定（env / setupFiles / reporters / exclude）を統一する
// - unit / integration のプロジェクト分割と差分（environment / include / globalSetup 等）を固定する
//
// 前提:
// - integration は Next.js サーバ起動に依存するため testTimeout を長めに取る
// ========================================================

import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Vitest 実行時は Next.js の自動ロードに依存せず、明示的に env ファイルを読み込む
    env: dotenv.config({ path: path.resolve(__dirname, ".env.local") }).parsed,
    setupFiles: ["./vitest.setup.ts"],
    // ファイル間並列実行を有効化
    fileParallelism: true,
    // ローカルでは詳細なレポートを出し、CIではファイル出力中心にする
    // - 失敗の詳細はレポートで見る
    reporters: process.env.CI
      ? ["default", "junit"]
      : ["default", "junit", "json", "html"],
    // - reporterごとに出力先を分ける（Vitestが対応している形）
    outputFile: process.env.CI
      ? {
          junit: "./.vitest/report/junit.xml",
        }
      : {
          junit: "./.vitest/report/junit.xml",
          json: "./.vitest/report/results.json",
          html: "./.vitest/report/html/index.html",
        },
    // カバレッジ設定
    coverage: {
      provider: "v8",
      // テスト失敗中でも HTML を生成する
      reportOnFailure: true,
      reporter: ["text", "json", "html"],
      reportsDirectory: "./.vitest/report/html/coverage",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      // 統合テストを除外
      exclude: ["**/*.integration.ts"],
    },
    exclude: [
      "**/node_modules",
      "**/.{git,idea,cache,output,temp}",
      // E2Eテストを除外（Playwrightのテスト）
      "./src/tests/e2e",
    ],
    projects: [
      {
        // 単体テスト設定
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["**/*.test.ts", "**/*.test.tsx"],
          // 統合テストを除外
          exclude: ["**/*.integration.test.ts"],
        },
        // 共通設定を継承
        extends: true,
      },
      {
        // 統合テスト設定
        test: {
          name: "integration",
          // APIを叩くためnode環境を使う
          environment: "node",
          include: ["**/*.integration.test.ts", "**/*.integration.test.tsx"],
          // Next.jsサーバの起動とヘルスチェック待機を行うグローバルセットアップ
          globalSetup: ["./src/tests/vitest-utils/integration/global-setup.ts"],
          testTimeout: 30_000,
        },
        // 共通設定を継承
        extends: true,
      },
    ],
  },
});
